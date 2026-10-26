using System.Globalization;
using MongoDB.Driver;
using PaisaPulse.Api.Data;
using PaisaPulse.Api.Data.Repositories;
using PaisaPulse.Api.Domain;
using PaisaPulse.Api.Services;

namespace PaisaPulse.Api.Jobs;

public interface IDailySummaryJob
{
    Task ExecuteAsync(CancellationToken ct = default);
}

public sealed partial class DailySummaryJob(
    IMongoDatabase database,
    IFixedExpenseRepository fixedExpenseRepo,
    ITransactionRepository transactionRepo,
    IDailySummaryRepository dailySummaryRepo,
    ILogger<DailySummaryJob> logger) : IDailySummaryJob
{
    public async Task ExecuteAsync(CancellationToken ct = default)
    {
        LogJobStarting(logger);

        var usersCollection = database.GetCollection<User>(MongoCollections.Users);
        var users = await usersCollection.Find(_ => true).ToListAsync(ct);

        foreach (var user in users)
        {
            try
            {
                await BuildSummaryForUserAsync(user, ct);
            }
            catch (Exception ex)
            {
                LogUserSummaryFailed(logger, ex, user.Id);
            }
        }

        LogJobCompleted(logger, users.Count);
    }

    public async Task BuildSummaryForUserAsync(User user, CancellationToken ct = default)
    {
        var tz = GetTimeZone(user.Timezone);
        var nowLocal = TimeZoneInfo.ConvertTimeFromUtc(DateTime.UtcNow, tz);
        // The job runs at midnight IST, summarizing the day that just concluded
        var yesterday = DateOnly.FromDateTime(nowLocal).AddDays(-1);
        var dateKey = yesterday.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture);

        var cycle = InsightsService.ComputeCycle(yesterday, user.Payday);

        var fixedExpenses = await fixedExpenseRepo.GetAllAsync(user.Id, ct);
        var totalFixed = fixedExpenses.Sum(f => f.AmountPaise);
        var discretionary = Math.Max(0, user.SalaryPaise - user.SavingsGoalPaise - totalFixed);

        // Fetch transactions for the cycle up to the end of yesterday
        var startLocal = cycle.Start.ToDateTime(TimeOnly.MinValue);
        var yesterdayEndLocal = yesterday.ToDateTime(new TimeOnly(23, 59, 59, 999));

        var startUtc = TimeZoneInfo.ConvertTimeToUtc(startLocal, tz);
        var endUtc = TimeZoneInfo.ConvertTimeToUtc(yesterdayEndLocal, tz);

        var startMs = new DateTimeOffset(startUtc).ToUnixTimeMilliseconds();
        var endMs = new DateTimeOffset(endUtc).ToUnixTimeMilliseconds();

        var cycleTxs = (await transactionRepo.GetForDateRangeAsync(user.Id, startMs, endMs, ct))
            .Where(InsightsService.CountsAsSpend)
            .ToList();

        // Spend before yesterday
        var yesterdayStartUtc = TimeZoneInfo.ConvertTimeToUtc(yesterday.ToDateTime(TimeOnly.MinValue), tz);
        var yesterdayStartMs = new DateTimeOffset(yesterdayStartUtc).ToUnixTimeMilliseconds();

        var spendBeforeYesterday = cycleTxs.Where(t => t.OccurredAt < yesterdayStartMs).Sum(t => t.AmountPaise);
        var yesterdayTxs = cycleTxs.Where(t => t.OccurredAt >= yesterdayStartMs && t.OccurredAt <= endMs).ToList();

        var spentYesterday = yesterdayTxs.Sum(t => t.AmountPaise);
        var daysRemainingFromYesterday = Math.Max(1, cycle.End.DayNumber - yesterday.DayNumber + 1);

        var budgetYesterday = Math.Max(0, (discretionary - spendBeforeYesterday) / daysRemainingFromYesterday);

        var topCategory = yesterdayTxs
            .GroupBy(t => t.Category)
            .OrderByDescending(g => g.Sum(x => x.AmountPaise))
            .Select(g => g.Key)
            .FirstOrDefault();

        var summary = new DailySummary
        {
            Id = $"{user.Id}_{dateKey}",
            UserId = user.Id,
            DateKey = dateKey,
            BudgetPaise = budgetYesterday,
            SpentPaise = spentYesterday,
            TopCategory = topCategory,
            CalculatedAt = DateTime.UtcNow
        };

        await dailySummaryRepo.UpsertAsync(summary, ct);
    }

    private static TimeZoneInfo GetTimeZone(string? timezone)
    {
        if (string.IsNullOrWhiteSpace(timezone))
        {
            timezone = "Asia/Kolkata";
        }

        try
        {
            return TimeZoneInfo.FindSystemTimeZoneById(timezone);
        }
        catch (TimeZoneNotFoundException)
        {
            if (timezone.Equals("Asia/Kolkata", StringComparison.OrdinalIgnoreCase))
            {
                try
                {
                    return TimeZoneInfo.FindSystemTimeZoneById("India Standard Time");
                }
                catch (TimeZoneNotFoundException)
                {
                    return TimeZoneInfo.Utc;
                }
            }
            return TimeZoneInfo.Utc;
        }
    }

    [LoggerMessage(LogLevel.Information, "Starting daily summaries build job...")]
    private static partial void LogJobStarting(ILogger logger);

    [LoggerMessage(LogLevel.Error, "Failed to build daily summary for user {UserId}")]
    private static partial void LogUserSummaryFailed(ILogger logger, Exception ex, string userId);

    [LoggerMessage(LogLevel.Information, "Daily summaries build job completed for {Count} users")]
    private static partial void LogJobCompleted(ILogger logger, int count);
}
