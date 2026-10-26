using PaisaPulse.Api.Domain;

namespace PaisaPulse.Api.Data.Repositories;

public sealed record TransactionSyncResult(int Inserted, int Updated, int TotalProcessed);

public sealed record TransactionPagedResult(
    IReadOnlyList<Transaction> Items,
    long TotalCount,
    int Page,
    int PageSize,
    int TotalPages);

public interface ITransactionRepository
{
    Task<TransactionSyncResult> SyncBatchAsync(
        string userId,
        IEnumerable<Transaction> transactions,
        CancellationToken ct = default);

    Task<TransactionPagedResult> GetAsync(
        string userId,
        long? fromMs,
        long? toMs,
        string? category,
        int page = 1,
        int pageSize = 50,
        CancellationToken ct = default);

    Task<Transaction?> GetByIdAsync(string userId, string id, CancellationToken ct = default);

    Task<Transaction?> UpdateAsync(
        string userId,
        string id,
        string? category,
        bool? isExcluded,
        string? note,
        CancellationToken ct = default);

    Task<IReadOnlyList<Transaction>> GetForDateRangeAsync(
        string userId,
        long startMs,
        long endMs,
        CancellationToken ct = default);
}
