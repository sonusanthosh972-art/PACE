using MongoDB.Driver;
using PaisaPulse.Api.Domain;

namespace PaisaPulse.Api.Data.Repositories;

public sealed class UserRuleRepository(IMongoDatabase database) : IUserRuleRepository
{
    private readonly IMongoCollection<UserRule> _collection =
        database.GetCollection<UserRule>(MongoCollections.UserRules);

    public async Task<IReadOnlyList<UserRule>> GetAllAsync(string userId, CancellationToken ct = default)
    {
        return await _collection.Find(r => r.UserId == userId).ToListAsync(ct);
    }

    public async Task<UserRule> UpsertAsync(string userId, UserRule rule, CancellationToken ct = default)
    {
        ArgumentNullException.ThrowIfNull(rule);
        rule.UserId = userId;
        if (string.IsNullOrWhiteSpace(rule.Id))
        {
            rule.Id = Guid.NewGuid().ToString("N");
        }
        if (rule.CreatedAt <= 0)
        {
            rule.CreatedAt = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
        }

        var filter = Builders<UserRule>.Filter.And(
            Builders<UserRule>.Filter.Eq(r => r.UserId, userId),
            Builders<UserRule>.Filter.Eq(r => r.Pattern, rule.Pattern));

        var update = Builders<UserRule>.Update
            .SetOnInsert(r => r.Id, rule.Id)
            .SetOnInsert(r => r.UserId, userId)
            .SetOnInsert(r => r.Pattern, rule.Pattern)
            .SetOnInsert(r => r.CreatedAt, rule.CreatedAt)
            .Set(r => r.Category, rule.Category);

        await _collection.UpdateOneAsync(filter, update, new UpdateOptions { IsUpsert = true }, ct);
        return rule;
    }
}
