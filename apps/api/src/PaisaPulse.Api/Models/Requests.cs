namespace PaisaPulse.Api.Models;

public sealed record RegisterRequest(string Email, string Password, string Name);

public sealed record LoginRequest(string Email, string Password);

public sealed record RefreshTokenRequest(string RefreshToken);

public sealed record AuthResponse(
    string AccessToken,
    string RefreshToken,
    UserProfileDto User);

public sealed record UserProfileDto(
    string Id,
    string Email,
    string Name,
    long SalaryPaise,
    int Payday,
    long SavingsGoalPaise,
    string Timezone);

public sealed record UpdateProfileRequest(
    long SalaryPaise,
    int Payday,
    long SavingsGoalPaise,
    string? Name = null,
    string? Timezone = null);

public sealed record FixedExpenseItemDto(
    string? Id,
    string Name,
    long AmountPaise,
    int DueDay);

public sealed record SyncTransactionsRequest(
    IReadOnlyList<TransactionItemDto> Transactions);

public sealed record TransactionItemDto(
    string? Id,
    long AmountPaise,
    string Direction,
    string? Merchant,
    string? MerchantNorm,
    string? Vpa,
    string Mode,
    string? AccountLast4,
    string? UpiRef,
    long? BalancePaise,
    string Category,
    bool NeedsReview,
    string? Note,
    string Source,
    long OccurredAt,
    string DedupeHash,
    bool IsExcluded,
    long? CreatedAt,
    long? UpdatedAt);

public sealed record PatchTransactionRequest(
    string? Category,
    bool? IsExcluded,
    string? Note);
