using MongoDB.Driver;
using PaisaPulse.Api.Domain;

namespace PaisaPulse.Api.Data.Repositories;

public sealed class UserRepository(IMongoDatabase database) : IUserRepository
{
    private readonly IMongoCollection<User> _users = database.GetCollection<User>(MongoCollections.Users);
    private readonly IMongoCollection<FixedExpense> _fixedExpenses = database.GetCollection<FixedExpense>(MongoCollections.FixedExpenses);
    private readonly IMongoCollection<Transaction> _transactions = database.GetCollection<Transaction>(MongoCollections.Transactions);
    private readonly IMongoCollection<UserRule> _userRules = database.GetCollection<UserRule>(MongoCollections.UserRules);
    private readonly IMongoCollection<DailySummary> _dailySummaries = database.GetCollection<DailySummary>(MongoCollections.DailySummaries);

    public async Task<User?> GetByIdAsync(string id, CancellationToken ct = default)
    {
        return await _users.Find(u => u.Id == id).FirstOrDefaultAsync(ct);
    }

    public async Task<User?> GetByEmailAsync(string email, CancellationToken ct = default)
    {
        var normalizedEmail = email.Trim().ToLowerInvariant();
        return await _users.Find(u => u.Email == normalizedEmail).FirstOrDefaultAsync(ct);
    }

    public async Task<User?> GetByRefreshTokenAsync(string refreshToken, CancellationToken ct = default)
    {
        return await _users.Find(u => u.RefreshToken == refreshToken && u.RefreshTokenExpiresAt > DateTime.UtcNow)
            .FirstOrDefaultAsync(ct);
    }

    public async Task<User> CreateAsync(User user, CancellationToken ct = default)
    {
        ArgumentNullException.ThrowIfNull(user);
        user.Email = user.Email.Trim().ToLowerInvariant();
        user.CreatedAt = DateTime.UtcNow;
        user.UpdatedAt = DateTime.UtcNow;
        await _users.InsertOneAsync(user, cancellationToken: ct);
        return user;
    }

    public async Task<User?> UpdateProfileAsync(
        string userId,
        string? name,
        long salaryPaise,
        int payday,
        long savingsGoalPaise,
        string? timezone,
        CancellationToken ct = default)
    {
        var update = Builders<User>.Update
            .Set(u => u.SalaryPaise, salaryPaise)
            .Set(u => u.Payday, payday)
            .Set(u => u.SavingsGoalPaise, savingsGoalPaise)
            .Set(u => u.UpdatedAt, DateTime.UtcNow);

        if (!string.IsNullOrWhiteSpace(name))
        {
            update = update.Set(u => u.Name, name.Trim());
        }

        if (!string.IsNullOrWhiteSpace(timezone))
        {
            update = update.Set(u => u.Timezone, timezone.Trim());
        }

        var options = new FindOneAndUpdateOptions<User> { ReturnDocument = ReturnDocument.After };
        return await _users.FindOneAndUpdateAsync(u => u.Id == userId, update, options, ct);
    }

    public async Task UpdateRefreshTokenAsync(
        string userId,
        string? refreshToken,
        DateTime? expiresAt,
        CancellationToken ct = default)
    {
        var update = Builders<User>.Update
            .Set(u => u.RefreshToken, refreshToken)
            .Set(u => u.RefreshTokenExpiresAt, expiresAt)
            .Set(u => u.UpdatedAt, DateTime.UtcNow);

        await _users.UpdateOneAsync(u => u.Id == userId, update, cancellationToken: ct);
    }

    public async Task<bool> DeleteAllUserDataAsync(string userId, CancellationToken ct = default)
    {
        // Delete all collections scoped to this user
        await _fixedExpenses.DeleteManyAsync(e => e.UserId == userId, ct);
        await _transactions.DeleteManyAsync(t => t.UserId == userId, ct);
        await _userRules.DeleteManyAsync(r => r.UserId == userId, ct);
        await _dailySummaries.DeleteManyAsync(s => s.UserId == userId, ct);

        var result = await _users.DeleteOneAsync(u => u.Id == userId, ct);
        return result.DeletedCount > 0;
    }
}
