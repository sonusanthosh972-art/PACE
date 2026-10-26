using PaisaPulse.Api.Domain;

namespace PaisaPulse.Api.Data.Repositories;

public interface IUserRepository
{
    Task<User?> GetByIdAsync(string id, CancellationToken ct = default);

    Task<User?> GetByEmailAsync(string email, CancellationToken ct = default);

    Task<User?> GetByRefreshTokenAsync(string refreshToken, CancellationToken ct = default);

    Task<User> CreateAsync(User user, CancellationToken ct = default);

    Task<User?> UpdateProfileAsync(
        string userId,
        string? name,
        long salaryPaise,
        int payday,
        long savingsGoalPaise,
        string? timezone,
        CancellationToken ct = default);

    Task UpdateRefreshTokenAsync(
        string userId,
        string? refreshToken,
        DateTime? expiresAt,
        CancellationToken ct = default);

    Task<bool> DeleteAllUserDataAsync(string userId, CancellationToken ct = default);
}
