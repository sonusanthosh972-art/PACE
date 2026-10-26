using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;
using PaisaPulse.Api.Models;
using PaisaPulse.Api.Tests.Infrastructure;

namespace PaisaPulse.Api.Tests;

[Collection("Mongo")]
public sealed class ValidationTests(MongoServerFixture fixture)
{
    [Fact]
    public async Task InvalidRegisterBodyReturnsProblemDetails()
    {
        var ct = TestContext.Current.CancellationToken;
        using var factory = new PaisaPulseApiFactory(fixture);
        var client = factory.CreateClient();

        // Invalid email and short password
        var badReg = new RegisterRequest("not-an-email", "short", "");
        var resp = await client.PostAsJsonAsync(new Uri("/api/v1/auth/register", UriKind.Relative), badReg, ct);

        Assert.Equal(HttpStatusCode.BadRequest, resp.StatusCode);
        Assert.Equal("application/problem+json", resp.Content.Headers.ContentType?.MediaType);

        var doc = await resp.Content.ReadFromJsonAsync<JsonElement>(cancellationToken: ct);
        Assert.True(doc.TryGetProperty("errors", out var errors));
        Assert.True(errors.TryGetProperty("Email", out _));
        Assert.True(errors.TryGetProperty("Password", out _));
        Assert.True(errors.TryGetProperty("Name", out _));
    }

    [Fact]
    public async Task InvalidProfileBodyReturnsProblemDetails()
    {
        var ct = TestContext.Current.CancellationToken;
        using var factory = new PaisaPulseApiFactory(fixture);
        var client = factory.CreateClient();

        var reg = new RegisterRequest($"val_{Guid.NewGuid():N}@example.com", "Password123!", "Val");
        var regResp = await client.PostAsJsonAsync(new Uri("/api/v1/auth/register", UriKind.Relative), reg, ct);
        var auth = await regResp.Content.ReadFromJsonAsync<AuthResponse>(cancellationToken: ct);
        Assert.NotNull(auth);

        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", auth.AccessToken);

        // Invalid salary (< 0) and invalid payday (> 31)
        var badProfile = new UpdateProfileRequest(-500, 35, -100);
        var resp = await client.PutAsJsonAsync(new Uri("/api/v1/me/profile", UriKind.Relative), badProfile, ct);

        Assert.Equal(HttpStatusCode.BadRequest, resp.StatusCode);
        Assert.Equal("application/problem+json", resp.Content.Headers.ContentType?.MediaType);

        var doc = await resp.Content.ReadFromJsonAsync<JsonElement>(cancellationToken: ct);
        Assert.True(doc.TryGetProperty("errors", out var errors));
        Assert.True(errors.TryGetProperty("SalaryPaise", out _));
        Assert.True(errors.TryGetProperty("Payday", out _));
    }

    [Fact]
    public async Task InvalidTransactionSyncBodyReturnsProblemDetails()
    {
        var ct = TestContext.Current.CancellationToken;
        using var factory = new PaisaPulseApiFactory(fixture);
        var client = factory.CreateClient();

        var reg = new RegisterRequest($"valtx_{Guid.NewGuid():N}@example.com", "Password123!", "ValTx");
        var regResp = await client.PostAsJsonAsync(new Uri("/api/v1/auth/register", UriKind.Relative), reg, ct);
        var auth = await regResp.Content.ReadFromJsonAsync<AuthResponse>(cancellationToken: ct);
        Assert.NotNull(auth);

        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", auth.AccessToken);

        // Non-positive amount, non-hex dedupeHash
        var badTx = new TransactionItemDto(
            null, 0, "debit", null, null, null, "UPI", null, null, null,
            "food", false, null, "sms", 1000, "not-a-64-char-hex-hash", false, null, null);

        var resp = await client.PostAsJsonAsync(
            new Uri("/api/v1/transactions/sync", UriKind.Relative),
            new SyncTransactionsRequest([badTx]),
            ct);

        Assert.Equal(HttpStatusCode.BadRequest, resp.StatusCode);
        Assert.Equal("application/problem+json", resp.Content.Headers.ContentType?.MediaType);
    }
}
