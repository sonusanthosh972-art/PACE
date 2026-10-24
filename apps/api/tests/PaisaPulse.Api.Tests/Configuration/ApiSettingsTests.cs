using PaisaPulse.Api.Configuration;

namespace PaisaPulse.Api.Tests.Configuration;

public sealed class ApiSettingsTests
{
    private const string SecretUri = "mongodb+srv://alice:s3cr3t-pass@cluster0.example.net/paisapulse";

    private static Func<string, string?> Env(string? mongoUri) =>
        name => name == ApiSettings.MongoDbUriVariable ? mongoUri : null;

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
    public void ToStringMasksConnectionString()
    {
        var settings = ApiSettings.FromEnvironment(Env(SecretUri));

        Assert.DoesNotContain("s3cr3t-pass", settings.ToString(), StringComparison.Ordinal);
    }
}
