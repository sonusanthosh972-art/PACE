using MongoDB.Driver;
using PaisaPulse.Api.Domain;

namespace PaisaPulse.Api.Data;

public static class IndexInitializer
{
    public static async Task InitializeAsync(IMongoDatabase database, CancellationToken ct = default)
    {
        ArgumentNullException.ThrowIfNull(database);

        // 1. users: unique email
        var users = database.GetCollection<User>(MongoCollections.Users);
        await users.Indexes.CreateOneAsync(
            new CreateIndexModel<User>(
                Builders<User>.IndexKeys.Ascending(u => u.Email),
                new CreateIndexOptions { Unique = true, Name = "ux_users_email" }),
            cancellationToken: ct);

        // 2. fixedExpenses: index on userId
        var fixedExpenses = database.GetCollection<FixedExpense>(MongoCollections.FixedExpenses);
        await fixedExpenses.Indexes.CreateOneAsync(
            new CreateIndexModel<FixedExpense>(
                Builders<FixedExpense>.IndexKeys.Ascending(e => e.UserId),
                new CreateIndexOptions { Name = "ix_fixedExpenses_userId" }),
            cancellationToken: ct);

        // 3. transactions: unique (userId, dedupeHash) - critical idempotency index
        var transactions = database.GetCollection<Transaction>(MongoCollections.Transactions);
        await transactions.Indexes.CreateOneAsync(
            new CreateIndexModel<Transaction>(
                Builders<Transaction>.IndexKeys.Ascending(t => t.UserId).Ascending(t => t.DedupeHash),
                new CreateIndexOptions { Unique = true, Name = "ux_transactions_userId_dedupeHash" }),
            cancellationToken: ct);

        await transactions.Indexes.CreateOneAsync(
            new CreateIndexModel<Transaction>(
                Builders<Transaction>.IndexKeys.Ascending(t => t.UserId).Descending(t => t.OccurredAt),
                new CreateIndexOptions { Name = "ix_transactions_userId_occurredAt" }),
            cancellationToken: ct);

        await transactions.Indexes.CreateOneAsync(
            new CreateIndexModel<Transaction>(
                Builders<Transaction>.IndexKeys.Ascending(t => t.UserId).Ascending(t => t.Category),
                new CreateIndexOptions { Name = "ix_transactions_userId_category" }),
            cancellationToken: ct);

        // 4. userRules: compound index on (userId, pattern)
        var userRules = database.GetCollection<UserRule>(MongoCollections.UserRules);
        await userRules.Indexes.CreateOneAsync(
            new CreateIndexModel<UserRule>(
                Builders<UserRule>.IndexKeys.Ascending(r => r.UserId).Ascending(r => r.Pattern),
                new CreateIndexOptions { Name = "ix_userRules_userId_pattern" }),
            cancellationToken: ct);

        // 5. dailySummaries: unique (userId, dateKey)
        var dailySummaries = database.GetCollection<DailySummary>(MongoCollections.DailySummaries);
        await dailySummaries.Indexes.CreateOneAsync(
            new CreateIndexModel<DailySummary>(
                Builders<DailySummary>.IndexKeys.Ascending(s => s.UserId).Ascending(s => s.DateKey),
                new CreateIndexOptions { Unique = true, Name = "ux_dailySummaries_userId_dateKey" }),
            cancellationToken: ct);
    }
}
