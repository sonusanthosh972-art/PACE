using PaisaPulse.Api.Configuration;

namespace PaisaPulse.Api.Tests.Configuration;

public sealed class ApiSettingsTests
{
    private const string SecretUri = "mongodb+srv://alice:s3cr3t-pass@cluster0.example.net/paisapulse";
    private const string ValidSecret = "default-valid-test-secret-at-least-32-chars!";

    private static Func<string, string?> Env(string? mongoUri, string? jwtSecret = ValidSecret) =>
        name => name switch
        {
            ApiSettings.MongoDbUriVariable => mongoUri,
            ApiSettings.JwtSecretVariable => jwtSecret,
            _ => null
        };

    [Theory]
    [InlineData(null)]
    [InlineData("")]
    [InlineData("   ")]
    public void FromEnvironmentFailsFastWhenMongoUriMissing(string? value)
    {
        var ex = Assert.Throws<InvalidOperationException>(() => ApiSettings.FromEnvironment(Env(value)));

        Assert.Contains(ApiSettings.MongoDbUriVariable, ex.Message, StringComparison.Ordinal);
        Assert.Contains(".env.example", ex.Message, StringComparison.Ordinal);
    }

    [Theory]
    [InlineData(null)]
    [InlineData("")]
    [InlineData("   ")]
    public void FromEnvironmentFailsFastWhenJwtSecretMissing(string? secret)
    {
        var ex = Assert.Throws<InvalidOperationException>(() => ApiSettings.FromEnvironment(Env(SecretUri, secret)));

        Assert.Contains(ApiSettings.JwtSecretVariable, ex.Message, StringComparison.Ordinal);
        Assert.Contains(".env.example", ex.Message, StringComparison.Ordinal);
    }

    [Fact]
    public void FromEnvironmentRejectsNonMongoSchemeWithoutEchoingTheValue()
    {
        const string bad = "postgres://alice:s3cr3t-pass@host/db";

        var ex = Assert.Throws<InvalidOperationException>(() => ApiSettings.FromEnvironment(Env(bad)));

        Assert.DoesNotContain("s3cr3t-pass", ex.Message, StringComparison.Ordinal);
    }

    [Theory]
    [InlineData("mongodb://localhost:27017")]
    [InlineData(SecretUri)]
    public void FromEnvironmentAcceptsMongoSchemesAndUsesPaisapulseDatabase(string uri)
    {
        var settings = ApiSettings.FromEnvironment(Env(uri));

        Assert.Equal(uri, settings.MongoDbUri);
        Assert.Equal("paisapulse", settings.DatabaseName);
    }

    [Fact]
    public void ToStringMasksConnectionStringAndJwtSecret()
    {
        var env = new Dictionary<string, string>
        {
            [ApiSettings.MongoDbUriVariable] = SecretUri,
            [ApiSettings.JwtSecretVariable] = "super-secret-jwt-signing-key-value-12345"
        };
        var settings = ApiSettings.FromEnvironment(k => env.GetValueOrDefault(k));

        Assert.DoesNotContain("s3cr3t-pass", settings.ToString(), StringComparison.Ordinal);
        Assert.DoesNotContain("super-secret", settings.ToString(), StringComparison.Ordinal);
    }

    [Fact]
    public void FromEnvironmentRejectsShortJwtSecret()
    {
        var env = new Dictionary<string, string>
        {
            [ApiSettings.MongoDbUriVariable] = SecretUri,
            [ApiSettings.JwtSecretVariable] = "too-short"
        };

        var ex = Assert.Throws<InvalidOperationException>(() => ApiSettings.FromEnvironment(k => env.GetValueOrDefault(k)));
        Assert.Contains(ApiSettings.JwtSecretVariable, ex.Message, StringComparison.Ordinal);
    }
}
