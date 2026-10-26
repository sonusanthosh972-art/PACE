using MongoDB.Bson.Serialization.Attributes;

namespace PaisaPulse.Api.Domain;

[BsonIgnoreExtraElements]
public sealed class DailySummary
{
    [BsonId]
    public string Id { get; set; } = Guid.NewGuid().ToString("N");

    public string UserId { get; set; } = string.Empty;

    public string DateKey { get; set; } = string.Empty;

    public long BudgetPaise { get; set; }

    public long SpentPaise { get; set; }

    public string? TopCategory { get; set; }

    public DateTime CalculatedAt { get; set; } = DateTime.UtcNow;
}
