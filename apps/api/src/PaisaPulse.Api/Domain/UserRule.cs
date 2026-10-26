using MongoDB.Bson.Serialization.Attributes;

namespace PaisaPulse.Api.Domain;

[BsonIgnoreExtraElements]
public sealed class UserRule
{
    [BsonId]
    public string Id { get; set; } = Guid.NewGuid().ToString("N");

    public string UserId { get; set; } = string.Empty;

    public string Pattern { get; set; } = string.Empty;

    public string Category { get; set; } = string.Empty;

    public long CreatedAt { get; set; }
}
