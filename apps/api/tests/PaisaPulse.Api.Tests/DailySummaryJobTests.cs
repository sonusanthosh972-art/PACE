using Microsoft.Extensions.Logging.Abstractions;
using MongoDB.Driver;
using PaisaPulse.Api.Data;
using PaisaPulse.Api.Data.Repositories;
using PaisaPulse.Api.Domain;
using PaisaPulse.Api.Jobs;
using PaisaPulse.Api.Tests.Infrastructure;

namespace PaisaPulse.Api.Tests;

[Collection("Mongo")]
public sealed class DailySummaryJobTests(MongoServerFixture fixture)
{
    [Fact]
    public async Task NightlySummaryJobCalculatesBudgetAndSpend()
    {
        var ct = TestContext.Current.CancellationToken;
        var db = fixture.CreateNewDatabase("summary_test");

        var userRepo = new UserRepository(db);
        var fixedRepo = new FixedExpenseRepository(db);
        var txRepo = new TransactionRepository(db);
        var summaryRepo = new DailySummaryRepository(db);

        var user = new User
        {
            Id = Guid.NewGuid().ToString("N"),
            Email = "nightly@example.com",
            Name = "Nightly",
            SalaryPaise = 6000000,
            Payday = 1,
            SavingsGoalPaise = 1000000,
            Timezone = "Asia/Kolkata"
        };
        await userRepo.CreateAsync(user, ct);

        // Fixed expenses: 2,000,000 paise (20k)
        await fixedRepo.ReplaceAllAsync(user.Id,
        [
            new FixedExpense { Name = "Rent", AmountPaise = 2000000, DueDay = 1 }
        ], ct);

        // Discretionary = 6,000,000 - 1,000,000 - 2,000,000 = 3,000,000 paise

        // Add spend transaction for yesterday
        var tz = TimeZoneInfo.FindSystemTimeZoneById("Asia/Kolkata");
        var nowLocal = TimeZoneInfo.ConvertTimeFromUtc(DateTime.UtcNow, tz);
        var yesterday = DateOnly.FromDateTime(nowLocal).AddDays(-1);
        var yesterdayDateTime = yesterday.ToDateTime(new TimeOnly(14, 30));
        var yesterdayUtc = TimeZoneInfo.ConvertTimeToUtc(yesterdayDateTime, tz);
        var yesterdayMs = new DateTimeOffset(yesterdayUtc).ToUnixTimeMilliseconds();

        var tx = new Transaction
        {
            Id = Guid.NewGuid().ToString("N"),
            UserId = user.Id,
            AmountPaise = 55000,
            Direction = "debit",
            Merchant = "Swiggy",
            Category = "food",
            Mode = "UPI",
            OccurredAt = yesterdayMs,
            DedupeHash = "hash1234567890123456789012345678901234567890123456789012345678901234",
            IsExcluded = false
        };
        await txRepo.SyncBatchAsync(user.Id, [tx], ct);

        var job = new DailySummaryJob(db, fixedRepo, txRepo, summaryRepo, NullLogger<DailySummaryJob>.Instance);
        await job.BuildSummaryForUserAsync(user, ct);

        var summary = await summaryRepo.GetAsync(user.Id, yesterday.ToString("yyyy-MM-dd", System.Globalization.CultureInfo.InvariantCulture), ct);
        Assert.NotNull(summary);
        Assert.Equal(55000, summary.SpentPaise);
        Assert.Equal("food", summary.TopCategory);
        Assert.True(summary.BudgetPaise > 0);
    }
}
