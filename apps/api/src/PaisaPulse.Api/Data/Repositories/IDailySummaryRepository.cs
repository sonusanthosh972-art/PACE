using PaisaPulse.Api.Domain;

namespace PaisaPulse.Api.Data.Repositories;

public interface IDailySummaryRepository
{
    Task<DailySummary?> GetAsync(string userId, string dateKey, CancellationToken ct = default);

    Task<IReadOnlyList<DailySummary>> GetRangeAsync(
        string userId,
        string fromDate,
        string toDate,
        CancellationToken ct = default);

    Task UpsertAsync(DailySummary summary, CancellationToken ct = default);
}
