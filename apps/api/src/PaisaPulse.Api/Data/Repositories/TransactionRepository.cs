using MongoDB.Driver;
using PaisaPulse.Api.Domain;

namespace PaisaPulse.Api.Data.Repositories;

public sealed class TransactionRepository(IMongoDatabase database) : ITransactionRepository
{
    private readonly IMongoCollection<Transaction> _collection =
        database.GetCollection<Transaction>(MongoCollections.Transactions);

    public async Task<TransactionSyncResult> SyncBatchAsync(
        string userId,
        IEnumerable<Transaction> transactions,
        CancellationToken ct = default)
    {
        ArgumentNullException.ThrowIfNull(transactions);

        var inserted = 0;
        var updated = 0;
        var total = 0;

        foreach (var tx in transactions)
        {
            tx.UserId = userId;
            if (string.IsNullOrWhiteSpace(tx.Id))
            {
                tx.Id = Guid.NewGuid().ToString("N");
            }

            var filter = Builders<Transaction>.Filter.And(
                Builders<Transaction>.Filter.Eq(t => t.UserId, userId),
                Builders<Transaction>.Filter.Eq(t => t.DedupeHash, tx.DedupeHash));

            var result = await _collection.ReplaceOneAsync(
                filter,
                tx,
                new ReplaceOptions { IsUpsert = true },
                cancellationToken: ct);

            if (result.UpsertedId is not null)
            {
                inserted++;
            }
            else if (result.MatchedCount > 0)
            {
                updated++;
            }
            total++;
        }

        return new TransactionSyncResult(inserted, updated, total);
    }

    public async Task<TransactionPagedResult> GetAsync(
        string userId,
        long? fromMs,
        long? toMs,
        string? category,
        int page = 1,
        int pageSize = 50,
        CancellationToken ct = default)
    {
        var builder = Builders<Transaction>.Filter;
        var filter = builder.Eq(t => t.UserId, userId);

        if (fromMs.HasValue)
        {
            filter &= builder.Gte(t => t.OccurredAt, fromMs.Value);
        }

        if (toMs.HasValue)
        {
            filter &= builder.Lte(t => t.OccurredAt, toMs.Value);
        }

        if (!string.IsNullOrWhiteSpace(category))
        {
            filter &= builder.Eq(t => t.Category, category.Trim());
        }

        page = Math.Max(1, page);
        pageSize = Math.Clamp(pageSize, 1, 200);

        var totalCount = await _collection.CountDocumentsAsync(filter, cancellationToken: ct);
        var totalPages = (int)Math.Ceiling((double)totalCount / pageSize);

        var items = await _collection.Find(filter)
            .SortByDescending(t => t.OccurredAt)
            .Skip((page - 1) * pageSize)
            .Limit(pageSize)
            .ToListAsync(ct);

        return new TransactionPagedResult(items, totalCount, page, pageSize, totalPages);
    }

    public async Task<Transaction?> GetByIdAsync(string userId, string id, CancellationToken ct = default)
    {
        return await _collection.Find(t => t.UserId == userId && t.Id == id).FirstOrDefaultAsync(ct);
    }

    public async Task<Transaction?> UpdateAsync(
        string userId,
        string id,
        string? category,
        bool? isExcluded,
        string? note,
        CancellationToken ct = default)
    {
        var filter = Builders<Transaction>.Filter.And(
            Builders<Transaction>.Filter.Eq(t => t.UserId, userId),
            Builders<Transaction>.Filter.Eq(t => t.Id, id));

        var update = Builders<Transaction>.Update.Set(t => t.UpdatedAt, DateTimeOffset.UtcNow.ToUnixTimeMilliseconds());

        if (!string.IsNullOrWhiteSpace(category))
        {
            update = update.Set(t => t.Category, category.Trim());
        }

        if (isExcluded.HasValue)
        {
            update = update.Set(t => t.IsExcluded, isExcluded.Value);
        }

        if (note is not null)
        {
            update = update.Set(t => t.Note, note.Trim());
        }

        var options = new FindOneAndUpdateOptions<Transaction> { ReturnDocument = ReturnDocument.After };
        return await _collection.FindOneAndUpdateAsync(filter, update, options, ct);
    }

    public async Task<IReadOnlyList<Transaction>> GetForDateRangeAsync(
        string userId,
        long startMs,
        long endMs,
        CancellationToken ct = default)
    {
        var builder = Builders<Transaction>.Filter;
        var filter = builder.Eq(t => t.UserId, userId)
            & builder.Gte(t => t.OccurredAt, startMs)
            & builder.Lte(t => t.OccurredAt, endMs);

        return await _collection.Find(filter)
            .SortByDescending(t => t.OccurredAt)
            .ToListAsync(ct);
    }
}
