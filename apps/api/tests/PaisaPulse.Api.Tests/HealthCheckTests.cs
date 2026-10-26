using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using PaisaPulse.Api.Tests.Infrastructure;

namespace PaisaPulse.Api.Tests;

[Collection("Mongo")]
public sealed class HealthCheckTests(MongoServerFixture fixture)
{
    [Fact]
    public async Task HealthEndpointReturnsHealthyWhenMongoConnected()
    {
        var ct = TestContext.Current.CancellationToken;
        using var factory = new PaisaPulseApiFactory(fixture);
        var client = factory.CreateClient();

        var response = await client.GetAsync(new Uri("/health", UriKind.Relative), ct);
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);

        var json = await response.Content.ReadFromJsonAsync<JsonElement>(cancellationToken: ct);
        Assert.Equal("healthy", json.GetProperty("status").GetString());
        Assert.Equal("connected", json.GetProperty("database").GetString());
    }
}
