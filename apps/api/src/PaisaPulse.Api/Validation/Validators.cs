using FluentValidation;
using PaisaPulse.Api.Models;

namespace PaisaPulse.Api.Validation;

public sealed class RegisterRequestValidator : AbstractValidator<RegisterRequest>
{
    public RegisterRequestValidator()
    {
        RuleFor(x => x.Email)
            .NotEmpty().WithMessage("Email is required.")
            .EmailAddress().WithMessage("Email must be a valid email address.")
            .MaximumLength(255);

        RuleFor(x => x.Password)
            .NotEmpty().WithMessage("Password is required.")
            .MinimumLength(8).WithMessage("Password must be at least 8 characters long.")
            .MaximumLength(100);

        RuleFor(x => x.Name)
            .NotEmpty().WithMessage("Name is required.")
            .MaximumLength(100);
    }
}

public sealed class LoginRequestValidator : AbstractValidator<LoginRequest>
{
    public LoginRequestValidator()
    {
        RuleFor(x => x.Email)
            .NotEmpty().WithMessage("Email is required.")
            .EmailAddress().WithMessage("Email must be a valid email address.");

        RuleFor(x => x.Password)
            .NotEmpty().WithMessage("Password is required.");
    }
}

public sealed class RefreshTokenRequestValidator : AbstractValidator<RefreshTokenRequest>
{
    public RefreshTokenRequestValidator()
    {
        RuleFor(x => x.RefreshToken)
            .NotEmpty().WithMessage("RefreshToken is required.");
    }
}

public sealed class UpdateProfileRequestValidator : AbstractValidator<UpdateProfileRequest>
{
    public UpdateProfileRequestValidator()
    {
        RuleFor(x => x.SalaryPaise)
            .GreaterThanOrEqualTo(0).WithMessage("Salary must be non-negative.");

        RuleFor(x => x.Payday)
            .InclusiveBetween(1, 31).WithMessage("Payday must be between 1 and 31.");

        RuleFor(x => x.SavingsGoalPaise)
            .GreaterThanOrEqualTo(0).WithMessage("Savings goal must be non-negative.");

        RuleFor(x => x.Name)
            .MaximumLength(100)
            .When(x => !string.IsNullOrEmpty(x.Name));

        RuleFor(x => x.Timezone)
            .MaximumLength(100)
            .When(x => !string.IsNullOrEmpty(x.Timezone));
    }
}

public sealed class FixedExpenseItemValidator : AbstractValidator<FixedExpenseItemDto>
{
    public FixedExpenseItemValidator()
    {
        RuleFor(x => x.Name)
            .NotEmpty().WithMessage("Fixed expense name is required.")
            .MaximumLength(60);

        RuleFor(x => x.AmountPaise)
            .GreaterThan(0).WithMessage("Amount must be greater than 0.");

        RuleFor(x => x.DueDay)
            .InclusiveBetween(1, 31).WithMessage("Due day must be between 1 and 31.");
    }
}

public sealed class SyncTransactionsRequestValidator : AbstractValidator<SyncTransactionsRequest>
{
    public SyncTransactionsRequestValidator()
    {
        RuleFor(x => x.Transactions)
            .NotNull().WithMessage("Transactions list cannot be null.");

        RuleForEach(x => x.Transactions).SetValidator(new TransactionItemValidator());
    }
}

public sealed class TransactionItemValidator : AbstractValidator<TransactionItemDto>
{
    private static readonly HashSet<string> AllowedDirections = new(StringComparer.OrdinalIgnoreCase)
    {
        "debit", "credit"
    };

    public TransactionItemValidator()
    {
        RuleFor(x => x.AmountPaise)
            .GreaterThan(0).WithMessage("Amount must be greater than 0.");

        RuleFor(x => x.Direction)
            .NotEmpty().WithMessage("Direction is required.")
            .Must(d => AllowedDirections.Contains(d)).WithMessage("Direction must be debit or credit.");

        RuleFor(x => x.OccurredAt)
            .GreaterThan(0).WithMessage("OccurredAt must be a valid positive timestamp.");

        RuleFor(x => x.DedupeHash)
            .NotEmpty().WithMessage("DedupeHash is required.")
            .Matches("^[0-9a-fA-F]{64}$").WithMessage("DedupeHash must be a 64-character hex string.");

        RuleFor(x => x.Category)
            .NotEmpty().WithMessage("Category is required.");

        RuleFor(x => x.Note)
            .MaximumLength(280)
            .When(x => !string.IsNullOrEmpty(x.Note));
    }
}

public sealed class PatchTransactionRequestValidator : AbstractValidator<PatchTransactionRequest>
{
    public PatchTransactionRequestValidator()
    {
        RuleFor(x => x)
            .Must(x => !string.IsNullOrWhiteSpace(x.Category) || x.IsExcluded.HasValue || x.Note is not null)
            .WithMessage("At least one field (Category, IsExcluded, or Note) must be provided for update.");

        RuleFor(x => x.Note)
            .MaximumLength(280)
            .When(x => !string.IsNullOrEmpty(x.Note));
    }
}
