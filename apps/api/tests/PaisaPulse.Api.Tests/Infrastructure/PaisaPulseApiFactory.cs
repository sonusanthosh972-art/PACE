using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Extensions.Configuration;
using MongoDB.Driver;
using PaisaPulse.Api.Configuration;

namespace PaisaPulse.Api.Tests.Infrastructure;

public sealed class PaisaPulseApiFactory : WebApplicationFactory<Program>
{
    private readonly MongoServerFixture _fixture;
    private readonly string _databaseName;

    public PaisaPulseApiFactory(MongoServerFixture fixture, string? dbPrefix = null)
    {
        ArgumentNullException.ThrowIfNull(fixture);
        _fixture = fixture;
        _databaseName = $"{dbPrefix ?? "test_api"}_{Guid.NewGuid():N}";

        Environment.SetEnvironmentVariable(ApiSettings.MongoDbUriVariable, _fixture.ConnectionString);
        Environment.SetEnvironmentVariable(ApiSettings.DatabaseNameVariable, _databaseName);
        Environment.SetEnvironmentVariable(ApiSettings.JwtSecretVariable, "test-jwt-secret-key-that-is-at-least-32-characters-long!");
    }

    public string DatabaseName => _databaseName;

    protected override void ConfigureWebHost(IWebHostBuilder builder)
    {
        builder.UseEnvironment("Development");

        builder.ConfigureAppConfiguration((_, config) =>
        {
            var dict = new Dictionary<string, string?>
            {
                [ApiSettings.MongoDbUriVariable] = _fixture.ConnectionString,
                [ApiSettings.DatabaseNameVariable] = _databaseName,
                [ApiSettings.JwtSecretVariable] = "test-jwt-secret-key-that-is-at-least-32-characters-long!"
            };
            config.AddInMemoryCollection(dict);
        });
    }

    public IMongoDatabase GetDatabase() => _fixture.Client.GetDatabase(_databaseName);
}
