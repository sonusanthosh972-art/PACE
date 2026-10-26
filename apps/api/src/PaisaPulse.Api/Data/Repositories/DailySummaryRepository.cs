using MongoDB.Driver;
using PaisaPulse.Api.Domain;

namespace PaisaPulse.Api.Data.Repositories;

public sealed class DailySummaryRepository(IMongoDatabase database) : IDailySummaryRepository
{
    private readonly IMongoCollection<DailySummary> _collection =
        database.GetCollection<DailySummary>(MongoCollections.DailySummaries);

    public async Task<DailySummary?> GetAsync(string userId, string dateKey, CancellationToken ct = default)
    {
        return await _collection.Find(s => s.UserId == userId && s.DateKey == dateKey).FirstOrDefaultAsync(ct);
    }

    public async Task<IReadOnlyList<DailySummary>> GetRangeAsync(
        string userId,
        string fromDate,
        string toDate,
        CancellationToken ct = default)
    {
        var filter = Builders<DailySummary>.Filter.And(
            Builders<DailySummary>.Filter.Eq(s => s.UserId, userId),
            Builders<DailySummary>.Filter.Gte(s => s.DateKey, fromDate),
            Builders<DailySummary>.Filter.Lte(s => s.DateKey, toDate));

        return await _collection.Find(filter)
            .SortBy(s => s.DateKey)
            .ToListAsync(ct);
    }

    public async Task UpsertAsync(DailySummary summary, CancellationToken ct = default)
    {
        ArgumentNullException.ThrowIfNull(summary);
        if (string.IsNullOrWhiteSpace(summary.Id))
        {
            summary.Id = Guid.NewGuid().ToString("N");
        }
        summary.CalculatedAt = DateTime.UtcNow;

        var filter = Builders<DailySummary>.Filter.And(
            Builders<DailySummary>.Filter.Eq(s => s.UserId, summary.UserId),
            Builders<DailySummary>.Filter.Eq(s => s.DateKey, summary.DateKey));

        await _collection.ReplaceOneAsync(filter, summary, new ReplaceOptions { IsUpsert = true }, ct);
    }
}
