using MongoDB.Bson.Serialization.Attributes;

namespace PaisaPulse.Api.Domain;

[BsonIgnoreExtraElements]
public sealed class User
{
    [BsonId]
    public string Id { get; set; } = Guid.NewGuid().ToString("N");

    public string Email { get; set; } = string.Empty;

    public string PasswordHash { get; set; } = string.Empty;

    public string Name { get; set; } = string.Empty;

    public long SalaryPaise { get; set; }

    public int Payday { get; set; } = 1;

    public long SavingsGoalPaise { get; set; }

    public string Timezone { get; set; } = "Asia/Kolkata";

    public string? RefreshToken { get; set; }

    public DateTime? RefreshTokenExpiresAt { get; set; }

    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;
}
