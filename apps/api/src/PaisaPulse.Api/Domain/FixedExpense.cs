using MongoDB.Bson.Serialization.Attributes;

namespace PaisaPulse.Api.Domain;

[BsonIgnoreExtraElements]
public sealed class FixedExpense
{
    [BsonId]
    public string Id { get; set; } = Guid.NewGuid().ToString("N");

    public string UserId { get; set; } = string.Empty;

    public string Name { get; set; } = string.Empty;

    public long AmountPaise { get; set; }

    public int DueDay { get; set; } = 1;

    public long CreatedAt { get; set; }
}
