using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Security.Cryptography;
using System.Text;
using PaisaPulse.Api.Data.Repositories;
using PaisaPulse.Api.Domain;
using PaisaPulse.Api.Models;
using PaisaPulse.Api.Services;
using PaisaPulse.Api.Tests.Infrastructure;

namespace PaisaPulse.Api.Tests;

[Collection("Mongo")]
public sealed class SyncAndTransactionsTests(MongoServerFixture fixture)
{
    private static async Task<HttpClient> CreateAuthenticatedClientAsync(PaisaPulseApiFactory factory, string email, CancellationToken ct)
    {
        var client = factory.CreateClient();
        var reg = new RegisterRequest(email, "Password123!", "SyncTester");
        var resp = await client.PostAsJsonAsync(new Uri("/api/v1/auth/register", UriKind.Relative), reg, ct);
        var auth = await resp.Content.ReadFromJsonAsync<AuthResponse>(cancellationToken: ct);
        Assert.NotNull(auth);

        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", auth.AccessToken);
        return client;
    }

    private static string ComputeHash(string input)
    {
        var bytes = SHA256.HashData(Encoding.UTF8.GetBytes(input));
        return Convert.ToHexStringLower(bytes);
    }

    [Fact]
    public async Task SyncBatchIsIdempotentAndStopsDuplicates()
    {
        var ct = TestContext.Current.CancellationToken;
        using var factory = new PaisaPulseApiFactory(fixture);
        var client = await CreateAuthenticatedClientAsync(factory, $"sync_{Guid.NewGuid():N}@example.com", ct);

        var nowMs = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
        var tx1 = new TransactionItemDto(
            Id: Guid.NewGuid().ToString("N"),
            AmountPaise: 45000,
            Direction: "debit",
            Merchant: "Swiggy",
            MerchantNorm: "swiggy",
            Vpa: "swiggy@icici",
            Mode: "UPI",
            AccountLast4: "1234",
            UpiRef: "123456789012",
            BalancePaise: 500000,
            Category: "food",
            NeedsReview: false,
            Note: "Dinner",
            Source: "sms",
            OccurredAt: nowMs - 10000,
            DedupeHash: ComputeHash("swiggy_ref_1"),
            IsExcluded: false,
            CreatedAt: nowMs,
            UpdatedAt: nowMs);

        var tx2 = new TransactionItemDto(
            Id: Guid.NewGuid().ToString("N"),
            AmountPaise: 12000,
            Direction: "debit",
            Merchant: "Blue Tokai",
            MerchantNorm: "bluetokai",
            Vpa: "bluetokai@yesbank",
            Mode: "UPI",
            AccountLast4: "1234",
            UpiRef: "123456789013",
            BalancePaise: 488000,
            Category: "coffee",
            NeedsReview: false,
            Note: "Morning latte",
            Source: "sms",
            OccurredAt: nowMs - 5000,
            DedupeHash: ComputeHash("bluetokai_ref_2"),
            IsExcluded: false,
            CreatedAt: nowMs,
            UpdatedAt: nowMs);

        var syncRequest = new SyncTransactionsRequest([tx1, tx2]);

        // First upload
        var resp1 = await client.PostAsJsonAsync(new Uri("/api/v1/transactions/sync", UriKind.Relative), syncRequest, ct);
        Assert.Equal(HttpStatusCode.OK, resp1.StatusCode);
        var res1 = await resp1.Content.ReadFromJsonAsync<TransactionSyncResult>(cancellationToken: ct);
        Assert.NotNull(res1);
        Assert.Equal(2, res1.Inserted);
        Assert.Equal(0, res1.Updated);

        // Second upload of the exact same batch: MUST be idempotent, 0 new inserts
        var resp2 = await client.PostAsJsonAsync(new Uri("/api/v1/transactions/sync", UriKind.Relative), syncRequest, ct);
        Assert.Equal(HttpStatusCode.OK, resp2.StatusCode);
        var res2 = await resp2.Content.ReadFromJsonAsync<TransactionSyncResult>(cancellationToken: ct);
        Assert.NotNull(res2);
        Assert.Equal(0, res2.Inserted);
        Assert.Equal(2, res2.Updated);

        // Fetch transactions: should still be exactly 2
        var listResp = await client.GetAsync(new Uri("/api/v1/transactions", UriKind.Relative), ct);
        Assert.Equal(HttpStatusCode.OK, listResp.StatusCode);
        var paged = await listResp.Content.ReadFromJsonAsync<TransactionPagedResult>(cancellationToken: ct);
        Assert.NotNull(paged);
        Assert.Equal(2, paged.TotalCount);
    }

    [Fact]
    public async Task GetTransactionsFiltersByCategoryAndDateRange()
    {
        var ct = TestContext.Current.CancellationToken;
        using var factory = new PaisaPulseApiFactory(fixture);
        var client = await CreateAuthenticatedClientAsync(factory, $"filter_{Guid.NewGuid():N}@example.com", ct);

        var baseTime = 1700000000000L;
        var txs = new List<TransactionItemDto>
        {
            new(null, 50000, "debit", "BigBasket", "bigbasket", null, "UPI", "1111", null, null, "groceries", false, null, "sms", baseTime + 1000, ComputeHash("h1"), false, null, null),
            new(null, 60000, "debit", "Uber", "uber", null, "UPI", "1111", null, null, "transport", false, null, "sms", baseTime + 2000, ComputeHash("h2"), false, null, null),
            new(null, 70000, "debit", "Zepto", "zepto", null, "UPI", "1111", null, null, "groceries", false, null, "sms", baseTime + 3000, ComputeHash("h3"), false, null, null),
        };

        await client.PostAsJsonAsync(new Uri("/api/v1/transactions/sync", UriKind.Relative), new SyncTransactionsRequest(txs), ct);

        // Filter by category
        var catResp = await client.GetAsync(new Uri("/api/v1/transactions?category=groceries", UriKind.Relative), ct);
        var catResult = await catResp.Content.ReadFromJsonAsync<TransactionPagedResult>(cancellationToken: ct);
        Assert.NotNull(catResult);
        Assert.Equal(2, catResult.TotalCount);
        Assert.All(catResult.Items, x => Assert.Equal("groceries", x.Category));

        // Filter by date range
        var dateResp = await client.GetAsync(new Uri($"/api/v1/transactions?from={baseTime + 1500}&to={baseTime + 2500}", UriKind.Relative), ct);
        var dateResult = await dateResp.Content.ReadFromJsonAsync<TransactionPagedResult>(cancellationToken: ct);
        Assert.NotNull(dateResult);
        Assert.Equal(1, dateResult.TotalCount);
        Assert.Equal("transport", dateResult.Items[0].Category);
    }

    [Fact]
    public async Task PatchTransactionUpdatesFields()
    {
        var ct = TestContext.Current.CancellationToken;
        using var factory = new PaisaPulseApiFactory(fixture);
        var client = await CreateAuthenticatedClientAsync(factory, $"patch_{Guid.NewGuid():N}@example.com", ct);

        var tx = new TransactionItemDto(
            null, 10000, "debit", "Chai", "chai", null, "UPI", null, null, null,
            "uncategorised", true, null, "sms", 1700000000000L, ComputeHash("patch_h"), false, null, null);

        await client.PostAsJsonAsync(new Uri("/api/v1/transactions/sync", UriKind.Relative), new SyncTransactionsRequest([tx]), ct);

        var listResp = await client.GetAsync(new Uri("/api/v1/transactions", UriKind.Relative), ct);
        var paged = await listResp.Content.ReadFromJsonAsync<TransactionPagedResult>(cancellationToken: ct);
        Assert.NotNull(paged);
        var id = paged.Items[0].Id;

        // Patch category and isExcluded
        var patchReq = new PatchTransactionRequest("coffee", true, "Special tea");
        var patchResp = await client.PatchAsJsonAsync(new Uri($"/api/v1/transactions/{id}", UriKind.Relative), patchReq, ct);
        Assert.Equal(HttpStatusCode.OK, patchResp.StatusCode);

        var updated = await patchResp.Content.ReadFromJsonAsync<Transaction>(cancellationToken: ct);
        Assert.NotNull(updated);
        Assert.Equal("coffee", updated.Category);
        Assert.True(updated.IsExcluded);
        Assert.Equal("Special tea", updated.Note);
    }

    [Fact]
    public async Task InsightsCycleAndDailyEndpoints()
    {
        var ct = TestContext.Current.CancellationToken;
        using var factory = new PaisaPulseApiFactory(fixture);
        var client = await CreateAuthenticatedClientAsync(factory, $"insights_{Guid.NewGuid():N}@example.com", ct);

        // Update profile
        await client.PutAsJsonAsync(new Uri("/api/v1/me/profile", UriKind.Relative), new UpdateProfileRequest(5000000, 1, 1000000), ct);

        // Upload some transactions
        var nowMs = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
        var txs = new List<TransactionItemDto>
        {
            new(null, 25000, "debit", "Starbucks", "starbucks", null, "UPI", null, null, null, "coffee", false, null, "sms", nowMs, ComputeHash("c1"), false, null, null),
            new(null, 80000, "debit", "Apollo", "apollo", null, "UPI", null, null, null, "health", false, null, "sms", nowMs, ComputeHash("c2"), false, null, null)
        };
        await client.PostAsJsonAsync(new Uri("/api/v1/transactions/sync", UriKind.Relative), new SyncTransactionsRequest(txs), ct);

        // Check cycle insights
        var cycleResp = await client.GetAsync(new Uri("/api/v1/insights/cycle", UriKind.Relative), ct);
        Assert.Equal(HttpStatusCode.OK, cycleResp.StatusCode);
        var cycle = await cycleResp.Content.ReadFromJsonAsync<CycleInsightsDto>(cancellationToken: ct);
        Assert.NotNull(cycle);
        Assert.Equal(105000, cycle.TotalSpendPaise);

        // Check daily insights
        var dailyResp = await client.GetAsync(new Uri("/api/v1/insights/daily", UriKind.Relative), ct);
        Assert.Equal(HttpStatusCode.OK, dailyResp.StatusCode);
        var daily = await dailyResp.Content.ReadFromJsonAsync<List<DailySpendDto>>(cancellationToken: ct);
        Assert.NotNull(daily);
        Assert.NotEmpty(daily);
    }
}
