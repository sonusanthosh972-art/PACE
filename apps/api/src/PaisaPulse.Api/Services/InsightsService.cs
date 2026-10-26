using PaisaPulse.Api.Data.Repositories;
using PaisaPulse.Api.Domain;

namespace PaisaPulse.Api.Services;

public sealed record CategoryTotalDto(string Category, long TotalPaise, int Count);

public sealed record SmallLeaksDto(int Count, long TotalPaise);

public sealed record MerchantTotalDto(string MerchantNorm, string MerchantDisplay, long TotalPaise, int Count);

public sealed record EssentialSplitDto(long EssentialPaise, long NonEssentialPaise);

public sealed record CycleInfoDto(string Start, string End, int TotalDays, int DaysRemaining);

public sealed record CycleInsightsDto(
    long TotalSpendPaise,
    IReadOnlyList<CategoryTotalDto> CategoryTotals,
    SmallLeaksDto SmallLeaks,
    IReadOnlyList<MerchantTotalDto> TopMerchants,
    EssentialSplitDto EssentialSplit,
    CycleInfoDto Cycle);

public sealed record DailySpendDto(string DateKey, long TotalSpendPaise, int Count);

public interface IInsightsService
{
    Task<CycleInsightsDto> GetCycleInsightsAsync(string userId, User user, CancellationToken ct = default);

    Task<IReadOnlyList<DailySpendDto>> GetDailyInsightsAsync(string userId, User user, CancellationToken ct = default);
}

public sealed class InsightsService(ITransactionRepository transactionRepo) : IInsightsService
{
    private static readonly HashSet<string> EssentialCategories = new(StringComparer.OrdinalIgnoreCase)
    {
        "groceries",
        "bills",
        "health",
        "transport"
    };

    public async Task<CycleInsightsDto> GetCycleInsightsAsync(string userId, User user, CancellationToken ct = default)
    {
        var tz = GetTimeZone(user.Timezone);
        var nowLocal = TimeZoneInfo.ConvertTimeFromUtc(DateTime.UtcNow, tz);
        var todayKey = DateOnly.FromDateTime(nowLocal);

        var cycle = ComputeCycle(todayKey, user.Payday);
        var startLocal = cycle.Start.ToDateTime(TimeOnly.MinValue);
        var endLocal = cycle.End.ToDateTime(new TimeOnly(23, 59, 59, 999));

        var startUtc = TimeZoneInfo.ConvertTimeToUtc(startLocal, tz);
        var endUtc = TimeZoneInfo.ConvertTimeToUtc(endLocal, tz);

        var startMs = new DateTimeOffset(startUtc).ToUnixTimeMilliseconds();
        var endMs = new DateTimeOffset(endUtc).ToUnixTimeMilliseconds();

        var transactions = await transactionRepo.GetForDateRangeAsync(userId, startMs, endMs, ct);
        var spendTxs = transactions.Where(CountsAsSpend).ToList();

        var totalSpend = spendTxs.Sum(t => t.AmountPaise);

        var categoryTotals = spendTxs
            .GroupBy(t => t.Category)
            .Select(g => new CategoryTotalDto(g.Key, g.Sum(x => x.AmountPaise), g.Count()))
            .OrderByDescending(c => c.TotalPaise)
            .ToList();

        var smallLeaksList = spendTxs.Where(t => t.AmountPaise < 50000).ToList();
        var smallLeaks = new SmallLeaksDto(smallLeaksList.Count, smallLeaksList.Sum(t => t.AmountPaise));

        var topMerchants = spendTxs
            .Where(t => !string.IsNullOrWhiteSpace(t.MerchantNorm ?? t.Merchant))
            .GroupBy(t => t.MerchantNorm ?? t.Merchant!)
            .Select(g =>
            {
                var sample = g.First();
                return new MerchantTotalDto(
                    g.Key,
                    sample.Merchant ?? g.Key,
                    g.Sum(x => x.AmountPaise),
                    g.Count());
            })
            .OrderByDescending(m => m.TotalPaise)
            .ThenByDescending(m => m.Count)
            .Take(3)
            .ToList();

        var essentialSpend = spendTxs.Where(t => EssentialCategories.Contains(t.Category)).Sum(t => t.AmountPaise);
        var nonEssentialSpend = totalSpend - essentialSpend;
        var split = new EssentialSplitDto(essentialSpend, nonEssentialSpend);

        var daysRemaining = Math.Max(1, cycle.End.DayNumber - todayKey.DayNumber + 1);
        var cycleInfo = new CycleInfoDto(
            cycle.Start.ToString("yyyy-MM-dd", System.Globalization.CultureInfo.InvariantCulture),
            cycle.End.ToString("yyyy-MM-dd", System.Globalization.CultureInfo.InvariantCulture),
            cycle.TotalDays,
            daysRemaining);

        return new CycleInsightsDto(totalSpend, categoryTotals, smallLeaks, topMerchants, split, cycleInfo);
    }

    public async Task<IReadOnlyList<DailySpendDto>> GetDailyInsightsAsync(string userId, User user, CancellationToken ct = default)
    {
        var tz = GetTimeZone(user.Timezone);
        var nowLocal = TimeZoneInfo.ConvertTimeFromUtc(DateTime.UtcNow, tz);
        var todayKey = DateOnly.FromDateTime(nowLocal);

        var cycle = ComputeCycle(todayKey, user.Payday);
        var startLocal = cycle.Start.ToDateTime(TimeOnly.MinValue);
        var endLocal = cycle.End.ToDateTime(new TimeOnly(23, 59, 59, 999));

        var startUtc = TimeZoneInfo.ConvertTimeToUtc(startLocal, tz);
        var endUtc = TimeZoneInfo.ConvertTimeToUtc(endLocal, tz);

        var startMs = new DateTimeOffset(startUtc).ToUnixTimeMilliseconds();
        var endMs = new DateTimeOffset(endUtc).ToUnixTimeMilliseconds();

        var transactions = await transactionRepo.GetForDateRangeAsync(userId, startMs, endMs, ct);
        var spendTxs = transactions.Where(CountsAsSpend).ToList();

        var map = new Dictionary<string, (long Total, int Count)>();

        // Pre-populate each day of cycle with 0
        for (var d = cycle.Start; d <= todayKey; d = d.AddDays(1))
        {
            map[d.ToString("yyyy-MM-dd", System.Globalization.CultureInfo.InvariantCulture)] = (0, 0);
        }

        foreach (var tx in spendTxs)
        {
            var txUtc = DateTimeOffset.FromUnixTimeMilliseconds(tx.OccurredAt).UtcDateTime;
            var txLocal = TimeZoneInfo.ConvertTimeFromUtc(txUtc, tz);
            var dateKey = txLocal.ToString("yyyy-MM-dd", System.Globalization.CultureInfo.InvariantCulture);

            if (map.TryGetValue(dateKey, out var current))
            {
                map[dateKey] = (current.Total + tx.AmountPaise, current.Count + 1);
            }
            else
            {
                map[dateKey] = (tx.AmountPaise, 1);
            }
        }

        return map
            .OrderBy(kv => kv.Key)
            .Select(kv => new DailySpendDto(kv.Key, kv.Value.Total, kv.Value.Count))
            .ToList();
    }

    public static bool CountsAsSpend(Transaction tx)
    {
        return string.Equals(tx.Direction, "debit", StringComparison.OrdinalIgnoreCase)
            && !tx.IsExcluded
            && !string.Equals(tx.Category, "rent_emi", StringComparison.OrdinalIgnoreCase);
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
            // Windows vs IANA fallback
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

    public static (DateOnly Start, DateOnly End, int TotalDays) ComputeCycle(DateOnly today, int payday)
    {
        payday = Math.Clamp(payday, 1, 31);

        var thisMonthDays = DateTime.DaysInMonth(today.Year, today.Month);
        var thisMonthPayday = Math.Min(payday, thisMonthDays);

        DateOnly start;
        DateOnly nextStart;

        if (today.Day >= thisMonthPayday)
        {
            start = new DateOnly(today.Year, today.Month, thisMonthPayday);
            var nextMonth = today.Month == 12 ? new DateOnly(today.Year + 1, 1, 1) : new DateOnly(today.Year, today.Month + 1, 1);
            var nextMonthDays = DateTime.DaysInMonth(nextMonth.Year, nextMonth.Month);
            var nextPayday = Math.Min(payday, nextMonthDays);
            nextStart = new DateOnly(nextMonth.Year, nextMonth.Month, nextPayday);
        }
        else
        {
            var prevMonth = today.Month == 1 ? new DateOnly(today.Year - 1, 12, 1) : new DateOnly(today.Year, today.Month - 1, 1);
            var prevMonthDays = DateTime.DaysInMonth(prevMonth.Year, prevMonth.Month);
            var prevPayday = Math.Min(payday, prevMonthDays);
            start = new DateOnly(prevMonth.Year, prevMonth.Month, prevPayday);
            nextStart = new DateOnly(today.Year, today.Month, thisMonthPayday);
        }

        var end = nextStart.AddDays(-1);
        var totalDays = end.DayNumber - start.DayNumber + 1;
        return (start, end, totalDays);
    }
}
