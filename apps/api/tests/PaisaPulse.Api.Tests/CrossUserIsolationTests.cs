using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Security.Cryptography;
using System.Text;
using MongoDB.Driver;
using PaisaPulse.Api.Data;
using PaisaPulse.Api.Data.Repositories;
using PaisaPulse.Api.Domain;
using PaisaPulse.Api.Models;
using PaisaPulse.Api.Tests.Infrastructure;

namespace PaisaPulse.Api.Tests;

[Collection("Mongo")]
public sealed class CrossUserIsolationTests(MongoServerFixture fixture)
{
    private static async Task<(HttpClient Client, AuthResponse Auth)> RegisterUserAsync(
        PaisaPulseApiFactory factory,
        string name,
        CancellationToken ct)
    {
        var client = factory.CreateClient();
        var email = $"{name.ToLowerInvariant()}_{Guid.NewGuid():N}@example.com";
        var reg = new RegisterRequest(email, "Password123!", name);
        var resp = await client.PostAsJsonAsync(new Uri("/api/v1/auth/register", UriKind.Relative), reg, ct);
        var auth = await resp.Content.ReadFromJsonAsync<AuthResponse>(cancellationToken: ct);
        Assert.NotNull(auth);

        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", auth.AccessToken);
        return (client, auth);
    }

    [Fact]
    public async Task UserACannotBeAccessedByOrLeakToUserB()
    {
        var ct = TestContext.Current.CancellationToken;
        using var factory = new PaisaPulseApiFactory(fixture);

        // 1. Setup User A with data
        var (clientA, authA) = await RegisterUserAsync(factory, "Alice", ct);

        await clientA.PutAsJsonAsync(
            new Uri("/api/v1/me/profile", UriKind.Relative),
            new UpdateProfileRequest(8000000, 1, 2000000, "Alice"),
            ct);

        await clientA.PutAsJsonAsync(
            new Uri("/api/v1/me/fixed-expenses", UriKind.Relative),
            new List<FixedExpenseItemDto> { new(null, "Alice Rent", 3000000, 1) },
            ct);

        var txAHash = Convert.ToHexStringLower(SHA256.HashData(Encoding.UTF8.GetBytes("alice_unique_tx")));
        var txA = new TransactionItemDto(
            Id: Guid.NewGuid().ToString("N"),
            AmountPaise: 99000,
            Direction: "debit",
            Merchant: "Alice Secret Shop",
            MerchantNorm: "alicesecretshop",
            Vpa: null,
            Mode: "UPI",
            AccountLast4: "9999",
            UpiRef: "999999999999",
            BalancePaise: null,
            Category: "shopping",
            NeedsReview: false,
            Note: "Alice private note",
            Source: "sms",
            OccurredAt: DateTimeOffset.UtcNow.ToUnixTimeMilliseconds(),
            DedupeHash: txAHash,
            IsExcluded: false,
            CreatedAt: null,
            UpdatedAt: null);

        await clientA.PostAsJsonAsync(new Uri("/api/v1/transactions/sync", UriKind.Relative), new SyncTransactionsRequest([txA]), ct);

        var listRespA = await clientA.GetAsync(new Uri("/api/v1/transactions", UriKind.Relative), ct);
        var pagedA = await listRespA.Content.ReadFromJsonAsync<TransactionPagedResult>(cancellationToken: ct);
        Assert.NotNull(pagedA);
        Assert.Equal(1, pagedA.TotalCount);
        var aliceTxId = pagedA.Items[0].Id;

        // 2. Setup User B
        var (clientB, _) = await RegisterUserAsync(factory, "Bob", ct);

        // 3. User B calls GET /transactions: MUST see 0 transactions
        var listRespB = await clientB.GetAsync(new Uri("/api/v1/transactions", UriKind.Relative), ct);
        Assert.Equal(HttpStatusCode.OK, listRespB.StatusCode);
        var pagedB = await listRespB.Content.ReadFromJsonAsync<TransactionPagedResult>(cancellationToken: ct);
        Assert.NotNull(pagedB);
        Assert.Equal(0, pagedB.TotalCount);
        Assert.Empty(pagedB.Items);

        // 4. User B attempts to PATCH Alice's transaction: MUST receive 404
        var patchRespB = await clientB.PatchAsJsonAsync(
            new Uri($"/api/v1/transactions/{aliceTxId}", UriKind.Relative),
            new PatchTransactionRequest("food", null, "Bob trying to hack"),
            ct);
        Assert.Equal(HttpStatusCode.NotFound, patchRespB.StatusCode);

        // Verify Alice's transaction is unchanged
        var checkAliceTx = await clientA.GetAsync(new Uri("/api/v1/transactions", UriKind.Relative), ct);
        var checkAlicePaged = await checkAliceTx.Content.ReadFromJsonAsync<TransactionPagedResult>(cancellationToken: ct);
        Assert.NotNull(checkAlicePaged);
        Assert.Equal("shopping", checkAlicePaged.Items[0].Category);
        Assert.Equal("Alice private note", checkAlicePaged.Items[0].Note);

        // 5. User B calls GET /fixed-expenses: MUST see 0 expenses
        var fixedRespB = await clientB.GetAsync(new Uri("/api/v1/me/fixed-expenses", UriKind.Relative), ct);
        Assert.Equal(HttpStatusCode.OK, fixedRespB.StatusCode);
        var fixedB = await fixedRespB.Content.ReadFromJsonAsync<List<FixedExpenseItemDto>>(cancellationToken: ct);
        Assert.NotNull(fixedB);
        Assert.Empty(fixedB);

        // 6. User B calls DELETE /me: Deletes Bob's account
        var deleteRespB = await clientB.DeleteAsync(new Uri("/api/v1/me", UriKind.Relative), ct);
        Assert.Equal(HttpStatusCode.NoContent, deleteRespB.StatusCode);

        // 7. Prove in the real database that Alice's account, profile, expenses, and transactions remain intact!
        var db = factory.GetDatabase();
        var aliceUser = await db.GetCollection<User>(MongoCollections.Users).Find(u => u.Id == authA.User.Id).FirstOrDefaultAsync(ct);
        Assert.NotNull(aliceUser);

        var aliceFixed = await db.GetCollection<FixedExpense>(MongoCollections.FixedExpenses).Find(f => f.UserId == authA.User.Id).ToListAsync(ct);
        Assert.Single(aliceFixed);
        Assert.Equal("Alice Rent", aliceFixed[0].Name);

        var aliceTxs = await db.GetCollection<Transaction>(MongoCollections.Transactions).Find(t => t.UserId == authA.User.Id).ToListAsync(ct);
        Assert.Single(aliceTxs);
        Assert.Equal(aliceTxId, aliceTxs[0].Id);
    }
}
