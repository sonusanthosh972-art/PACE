using PaisaPulse.Api.Domain;

namespace PaisaPulse.Api.Data.Repositories;

public interface IFixedExpenseRepository
{
    Task<IReadOnlyList<FixedExpense>> GetAllAsync(string userId, CancellationToken ct = default);

    Task<IReadOnlyList<FixedExpense>> ReplaceAllAsync(
        string userId,
        IEnumerable<FixedExpense> items,
        CancellationToken ct = default);
}
