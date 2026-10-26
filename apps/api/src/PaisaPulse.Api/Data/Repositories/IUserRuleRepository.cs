using PaisaPulse.Api.Domain;

namespace PaisaPulse.Api.Data.Repositories;

public interface IUserRuleRepository
{
    Task<IReadOnlyList<UserRule>> GetAllAsync(string userId, CancellationToken ct = default);

    Task<UserRule> UpsertAsync(string userId, UserRule rule, CancellationToken ct = default);
}
