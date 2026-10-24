namespace PaisaPulse.Api.Configuration;

/// <summary>Strongly typed, validated settings read from environment variables.</summary>
internal sealed record ApiSettings(string MongoDbUri, string DatabaseName)
{
    public const string MongoDbUriVariable = "MONGODB_URI";
    public const string DefaultDatabaseName = "paisapulse";

    /// <summary>
    /// Reads and validates settings. Throws <see cref="InvalidOperationException"/> with an
    /// actionable message on failure. Error messages never include the secret value.
    /// </summary>
    public static ApiSettings FromEnvironment(Func<string, string?> getVariable)
    {
        ArgumentNullException.ThrowIfNull(getVariable);

        var mongoUri = getVariable(MongoDbUriVariable);
        if (string.IsNullOrWhiteSpace(mongoUri))
        {
            throw new InvalidOperationException(
                $"{MongoDbUriVariable} is not set. Copy apps/api/.env.example to apps/api/.env and fill it in, "
                    + $"or run: dotnet user-secrets set {MongoDbUriVariable} \"<connection string>\"");
        }

        mongoUri = mongoUri.Trim();
        if (
            !mongoUri.StartsWith("mongodb://", StringComparison.Ordinal)
            && !mongoUri.StartsWith("mongodb+srv://", StringComparison.Ordinal)
        )
        {
            throw new InvalidOperationException(
                $"{MongoDbUriVariable} must start with mongodb:// or mongodb+srv://.");
        }

        return new ApiSettings(mongoUri, DefaultDatabaseName);
    }

    // Keep the connection string out of logs, exceptions and debugger displays.
    public override string ToString() => $"ApiSettings {{ DatabaseName = {DatabaseName}, MongoDbUri = *** }}";
}
