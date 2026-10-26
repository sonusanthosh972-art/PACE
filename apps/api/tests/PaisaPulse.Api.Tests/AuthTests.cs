using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using PaisaPulse.Api.Models;
using PaisaPulse.Api.Tests.Infrastructure;

namespace PaisaPulse.Api.Tests;

[Collection("Mongo")]
public sealed class AuthTests(MongoServerFixture fixture)
{
    [Fact]
    public async Task RegisterSuccessAndDuplicateEmailConflict()
    {
        var ct = TestContext.Current.CancellationToken;
        using var factory = new PaisaPulseApiFactory(fixture);
        var client = factory.CreateClient();

        var email = $"alice_{Guid.NewGuid():N}@example.com";
        var reg = new RegisterRequest(email, "P@ssw0rd123!", "Alice");

        var response = await client.PostAsJsonAsync(new Uri("/api/v1/auth/register", UriKind.Relative), reg, ct);
        Assert.Equal(HttpStatusCode.Created, response.StatusCode);

        var auth = await response.Content.ReadFromJsonAsync<AuthResponse>(cancellationToken: ct);
        Assert.NotNull(auth);
        Assert.NotEmpty(auth.AccessToken);
        Assert.NotEmpty(auth.RefreshToken);
        Assert.Equal(email, auth.User.Email);
        Assert.Equal("Alice", auth.User.Name);

        // Duplicate registration should return 409 Conflict
        var dupResponse = await client.PostAsJsonAsync(new Uri("/api/v1/auth/register", UriKind.Relative), reg, ct);
        Assert.Equal(HttpStatusCode.Conflict, dupResponse.StatusCode);
    }

    [Fact]
    public async Task LoginSuccessAndInvalidCredentials()
    {
        var ct = TestContext.Current.CancellationToken;
        using var factory = new PaisaPulseApiFactory(fixture);
        var client = factory.CreateClient();

        var email = $"bob_{Guid.NewGuid():N}@example.com";
        var reg = new RegisterRequest(email, "SecretPassword123!", "Bob");
        await client.PostAsJsonAsync(new Uri("/api/v1/auth/register", UriKind.Relative), reg, ct);

        // Correct credentials
        var loginResp = await client.PostAsJsonAsync(
            new Uri("/api/v1/auth/login", UriKind.Relative),
            new LoginRequest(email, "SecretPassword123!"),
            ct);
        Assert.Equal(HttpStatusCode.OK, loginResp.StatusCode);
        var auth = await loginResp.Content.ReadFromJsonAsync<AuthResponse>(cancellationToken: ct);
        Assert.NotNull(auth);
        Assert.NotEmpty(auth.AccessToken);

        // Wrong password
        var badPassResp = await client.PostAsJsonAsync(
            new Uri("/api/v1/auth/login", UriKind.Relative),
            new LoginRequest(email, "WrongPassword!"),
            ct);
        Assert.Equal(HttpStatusCode.Unauthorized, badPassResp.StatusCode);

        // Non-existent user
        var noUserResp = await client.PostAsJsonAsync(
            new Uri("/api/v1/auth/login", UriKind.Relative),
            new LoginRequest("nobody@example.com", "SecretPassword123!"),
            ct);
        Assert.Equal(HttpStatusCode.Unauthorized, noUserResp.StatusCode);
    }

    [Fact]
    public async Task RefreshTokenRotationAndRejectionOfInvalid()
    {
        var ct = TestContext.Current.CancellationToken;
        using var factory = new PaisaPulseApiFactory(fixture);
        var client = factory.CreateClient();

        var email = $"charlie_{Guid.NewGuid():N}@example.com";
        var reg = new RegisterRequest(email, "P@ssw0rd123!", "Charlie");
        var regResp = await client.PostAsJsonAsync(new Uri("/api/v1/auth/register", UriKind.Relative), reg, ct);
        var auth = await regResp.Content.ReadFromJsonAsync<AuthResponse>(cancellationToken: ct);
        Assert.NotNull(auth);

        // Valid refresh token rotates and gives new tokens
        var refreshResp = await client.PostAsJsonAsync(
            new Uri("/api/v1/auth/refresh", UriKind.Relative),
            new RefreshTokenRequest(auth.RefreshToken),
            ct);
        Assert.Equal(HttpStatusCode.OK, refreshResp.StatusCode);

        var refreshedAuth = await refreshResp.Content.ReadFromJsonAsync<AuthResponse>(cancellationToken: ct);
        Assert.NotNull(refreshedAuth);
        Assert.NotEmpty(refreshedAuth.AccessToken);
        Assert.NotEmpty(refreshedAuth.RefreshToken);
        Assert.NotEqual(auth.RefreshToken, refreshedAuth.RefreshToken);

        // Old refresh token must be rejected
        var oldRefreshResp = await client.PostAsJsonAsync(
            new Uri("/api/v1/auth/refresh", UriKind.Relative),
            new RefreshTokenRequest(auth.RefreshToken),
            ct);
        Assert.Equal(HttpStatusCode.Unauthorized, oldRefreshResp.StatusCode);

        // Protected endpoint accepts new access token
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", refreshedAuth.AccessToken);
        var profileResp = await client.GetAsync(new Uri("/api/v1/me/profile", UriKind.Relative), ct);
        Assert.Equal(HttpStatusCode.OK, profileResp.StatusCode);
    }
}
