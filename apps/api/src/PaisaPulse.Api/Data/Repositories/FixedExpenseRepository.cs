using MongoDB.Driver;
using PaisaPulse.Api.Domain;

namespace PaisaPulse.Api.Data.Repositories;

public sealed class FixedExpenseRepository(IMongoDatabase database) : IFixedExpenseRepository
{
    private readonly IMongoCollection<FixedExpense> _collection =
        database.GetCollection<FixedExpense>(MongoCollections.FixedExpenses);

    public async Task<IReadOnlyList<FixedExpense>> GetAllAsync(string userId, CancellationToken ct = default)
    {
        return await _collection.Find(x => x.UserId == userId)
            .SortBy(x => x.DueDay)
            .ToListAsync(ct);
    }

    public async Task<IReadOnlyList<FixedExpense>> ReplaceAllAsync(
        string userId,
        IEnumerable<FixedExpense> items,
        CancellationToken ct = default)
    {
        ArgumentNullException.ThrowIfNull(items);

        var list = items.Select(item =>
        {
            item.UserId = userId;
            if (string.IsNullOrWhiteSpace(item.Id))
            {
                item.Id = Guid.NewGuid().ToString("N");
            }
            if (item.CreatedAt <= 0)
            {
                item.CreatedAt = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
            }
            return item;
        }).ToList();

        // Atomically replace the fixed expenses for this user
        await _collection.DeleteManyAsync(x => x.UserId == userId, ct);
        if (list.Count > 0)
        {
            await _collection.InsertManyAsync(list, cancellationToken: ct);
        }

        return list;
    }
}
