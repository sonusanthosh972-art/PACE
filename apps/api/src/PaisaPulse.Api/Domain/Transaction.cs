using MongoDB.Bson.Serialization.Attributes;

namespace PaisaPulse.Api.Domain;

[BsonIgnoreExtraElements]
public sealed class Transaction
{
    [BsonId]
    public string Id { get; set; } = Guid.NewGuid().ToString("N");

    public string UserId { get; set; } = string.Empty;

    public long AmountPaise { get; set; }

    public string Direction { get; set; } = "debit";

    public string? Merchant { get; set; }

    public string? MerchantNorm { get; set; }

    public string? Vpa { get; set; }

    public string Mode { get; set; } = "UPI";

    public string? AccountLast4 { get; set; }

    public string? UpiRef { get; set; }

    public long? BalancePaise { get; set; }

    public string Category { get; set; } = "uncategorised";

    public bool NeedsReview { get; set; }

    public string? Note { get; set; }

    public string Source { get; set; } = "sms";

    public long OccurredAt { get; set; }

    public string DedupeHash { get; set; } = string.Empty;

    public bool IsExcluded { get; set; }

    public long CreatedAt { get; set; }

    public long UpdatedAt { get; set; }
}
