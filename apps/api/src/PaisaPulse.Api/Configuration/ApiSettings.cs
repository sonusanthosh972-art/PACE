namespace PaisaPulse.Api.Configuration;

/// <summary>Strongly typed, validated settings read from environment variables.</summary>
internal sealed record ApiSettings(
    string MongoDbUri,
    string DatabaseName,
    string JwtSecret,
    string JwtIssuer = "PaisaPulse.Api",
    string JwtAudience = "PaisaPulse.Mobile",
    string CorsOrigins = "")
{
    public const string MongoDbUriVariable = "MONGODB_URI";
    public const string JwtSecretVariable = "JWT_SECRET";
    public const string DatabaseNameVariable = "MONGODB_DATABASE";
    public const string CorsOriginsVariable = "CORS_ORIGINS";
    public const string DefaultDatabaseName = "paisapulse";

    /// <summary>
    /// Reads and validates settings. Throws <see cref="InvalidOperationException"/> with an
    /// actionable message on failure. Error messages never include secret values.
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

        var dbName = getVariable(DatabaseNameVariable)?.Trim();
        if (string.IsNullOrWhiteSpace(dbName))
        {
            dbName = DefaultDatabaseName;
        }

        var jwtSecret = getVariable(JwtSecretVariable)?.Trim();
        if (string.IsNullOrWhiteSpace(jwtSecret))
        {
            throw new InvalidOperationException(
                $"{JwtSecretVariable} is not set. Copy apps/api/.env.example to apps/api/.env and fill it in, "
                    + $"or run: dotnet user-secrets set {JwtSecretVariable} \"<secret>\"");
        }

        if (jwtSecret.Length < 32)
        {
            throw new InvalidOperationException($"{JwtSecretVariable} must be at least 32 characters long.");
        }

        var corsOrigins = getVariable(CorsOriginsVariable)?.Trim() ?? string.Empty;

        return new ApiSettings(mongoUri, dbName, jwtSecret, CorsOrigins: corsOrigins);
    }

    // Keep the connection string and secret out of logs, exceptions and debugger displays.
    public override string ToString() => $"ApiSettings {{ DatabaseName = {DatabaseName}, MongoDbUri = ***, JwtSecret = *** }}";
}
