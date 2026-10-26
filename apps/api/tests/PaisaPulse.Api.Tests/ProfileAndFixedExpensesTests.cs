using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using PaisaPulse.Api.Models;
using PaisaPulse.Api.Tests.Infrastructure;

namespace PaisaPulse.Api.Tests;

[Collection("Mongo")]
public sealed class ProfileAndFixedExpensesTests(MongoServerFixture fixture)
{
    private static async Task<HttpClient> CreateAuthenticatedClientAsync(PaisaPulseApiFactory factory, string email, CancellationToken ct)
    {
        var client = factory.CreateClient();
        var reg = new RegisterRequest(email, "Password123!", "Tester");
        var resp = await client.PostAsJsonAsync(new Uri("/api/v1/auth/register", UriKind.Relative), reg, ct);
        var auth = await resp.Content.ReadFromJsonAsync<AuthResponse>(cancellationToken: ct);
        Assert.NotNull(auth);

        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", auth.AccessToken);
        return client;
    }

    [Fact]
    public async Task ProfileGetAndPut()
    {
        var ct = TestContext.Current.CancellationToken;
        using var factory = new PaisaPulseApiFactory(fixture);
        var client = await CreateAuthenticatedClientAsync(factory, $"profile_{Guid.NewGuid():N}@example.com", ct);

        // Initial profile
        var getResp = await client.GetAsync(new Uri("/api/v1/me/profile", UriKind.Relative), ct);
        Assert.Equal(HttpStatusCode.OK, getResp.StatusCode);
        var profile = await getResp.Content.ReadFromJsonAsync<UserProfileDto>(cancellationToken: ct);
        Assert.NotNull(profile);
        Assert.Equal("Tester", profile.Name);

        // Update profile
        var update = new UpdateProfileRequest(
            SalaryPaise: 7500000,
            Payday: 28,
            SavingsGoalPaise: 1500000,
            Name: "Updated Tester",
            Timezone: "Asia/Kolkata");

        var putResp = await client.PutAsJsonAsync(new Uri("/api/v1/me/profile", UriKind.Relative), update, ct);
        Assert.Equal(HttpStatusCode.OK, putResp.StatusCode);

        var updated = await putResp.Content.ReadFromJsonAsync<UserProfileDto>(cancellationToken: ct);
        Assert.NotNull(updated);
        Assert.Equal(7500000, updated.SalaryPaise);
        Assert.Equal(28, updated.Payday);
        Assert.Equal(1500000, updated.SavingsGoalPaise);
        Assert.Equal("Updated Tester", updated.Name);
    }

    [Fact]
    public async Task FixedExpensesGetAndPut()
    {
        var ct = TestContext.Current.CancellationToken;
        using var factory = new PaisaPulseApiFactory(fixture);
        var client = await CreateAuthenticatedClientAsync(factory, $"fixed_{Guid.NewGuid():N}@example.com", ct);

        var items = new List<FixedExpenseItemDto>
        {
            new(null, "Rent", 2500000, 1),
            new(null, "Car EMI", 1200000, 5)
        };

        var putResp = await client.PutAsJsonAsync(new Uri("/api/v1/me/fixed-expenses", UriKind.Relative), items, ct);
        Assert.Equal(HttpStatusCode.OK, putResp.StatusCode);

        var saved = await putResp.Content.ReadFromJsonAsync<List<FixedExpenseItemDto>>(cancellationToken: ct);
        Assert.NotNull(saved);
        Assert.Equal(2, saved.Count);
        Assert.Contains(saved, x => x.Name == "Rent" && x.AmountPaise == 2500000);
        Assert.Contains(saved, x => x.Name == "Car EMI" && x.AmountPaise == 1200000);

        var getResp = await client.GetAsync(new Uri("/api/v1/me/fixed-expenses", UriKind.Relative), ct);
        Assert.Equal(HttpStatusCode.OK, getResp.StatusCode);
        var fetched = await getResp.Content.ReadFromJsonAsync<List<FixedExpenseItemDto>>(cancellationToken: ct);
        Assert.NotNull(fetched);
        Assert.Equal(2, fetched.Count);
    }
}
