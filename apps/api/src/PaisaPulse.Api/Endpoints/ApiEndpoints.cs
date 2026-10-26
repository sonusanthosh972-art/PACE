using System.Security.Claims;
using FluentValidation;
using Microsoft.AspNetCore.Mvc;
using MongoDB.Bson;
using MongoDB.Driver;
using PaisaPulse.Api.Data.Repositories;
using PaisaPulse.Api.Domain;
using PaisaPulse.Api.Models;
using PaisaPulse.Api.Services;

namespace PaisaPulse.Api.Endpoints;

public static class ApiEndpoints
{
    public static void MapPaisaPulseEndpoints(this IEndpointRouteBuilder app)
    {
        // Health check endpoint
        app.MapGet("/health", CheckHealthAsync);
        app.MapGet("/api/v1/health", CheckHealthAsync);

        var v1 = app.MapGroup("/api/v1");

        // Auth endpoints (anonymous, with auth rate limiting)
        var auth = v1.MapGroup("/auth").RequireRateLimiting("auth");
        auth.MapPost("/register", RegisterAsync);
        auth.MapPost("/login", LoginAsync);
        auth.MapPost("/refresh", RefreshTokenAsync);

        // Protected endpoints (require JWT)
        var protectedApi = v1.MapGroup(string.Empty)
            .RequireAuthorization()
            .RequireRateLimiting("api");

        // Me endpoints
        var me = protectedApi.MapGroup("/me");
        me.MapGet("/profile", GetProfileAsync);
        me.MapPut("/profile", UpdateProfileAsync);
        me.MapGet("/fixed-expenses", GetFixedExpensesAsync);
        me.MapPut("/fixed-expenses", UpdateFixedExpensesAsync);
        me.MapDelete(string.Empty, DeleteAccountAsync);

        // Transactions endpoints
        var transactions = protectedApi.MapGroup("/transactions");
        transactions.MapPost("/sync", SyncTransactionsAsync);
        transactions.MapGet(string.Empty, GetTransactionsAsync);
        transactions.MapPatch("/{id}", PatchTransactionAsync);

        // Insights endpoints
        var insights = protectedApi.MapGroup("/insights");
        insights.MapGet("/cycle", GetCycleInsightsAsync);
        insights.MapGet("/daily", GetDailyInsightsAsync);
    }

    private static async Task<IResult> CheckHealthAsync(IMongoDatabase database, CancellationToken ct)
    {
        try
        {
            await database.RunCommandAsync((Command<BsonDocument>)"{ping:1}", cancellationToken: ct);
            return Results.Ok(new { status = "healthy", database = "connected" });
        }
        catch (Exception ex)
        {
            return Results.Problem(
                title: "Database connection failed",
                detail: ex.Message,
                statusCode: StatusCodes.Status503ServiceUnavailable);
        }
    }

    private static async Task<IResult> RegisterAsync(
        [FromBody] RegisterRequest request,
        IValidator<RegisterRequest> validator,
        IUserRepository userRepo,
        IPasswordHasher passwordHasher,
        ITokenService tokenService,
        CancellationToken ct)
    {
        var validation = await validator.ValidateAsync(request, ct);
        if (!validation.IsValid)
        {
            return Results.ValidationProblem(validation.ToDictionary());
        }

        var existing = await userRepo.GetByEmailAsync(request.Email, ct);
        if (existing is not null)
        {
            return Results.Problem(
                title: "Email already registered",
                detail: "An account with this email address already exists.",
                statusCode: StatusCodes.Status409Conflict);
        }

        var user = new User
        {
            Email = request.Email,
            PasswordHash = passwordHasher.HashPassword(request.Password),
            Name = request.Name.Trim(),
            Timezone = "Asia/Kolkata"
        };

        var tokens = tokenService.GenerateTokens(user);
        user.RefreshToken = tokens.RefreshToken;
        user.RefreshTokenExpiresAt = tokens.RefreshTokenExpiresAt;

        await userRepo.CreateAsync(user, ct);

        var profileDto = new UserProfileDto(
            user.Id,
            user.Email,
            user.Name,
            user.SalaryPaise,
            user.Payday,
            user.SavingsGoalPaise,
            user.Timezone);

        return Results.Created($"/api/v1/me/profile", new AuthResponse(tokens.AccessToken, tokens.RefreshToken, profileDto));
    }

    private static async Task<IResult> LoginAsync(
        [FromBody] LoginRequest request,
        IValidator<LoginRequest> validator,
        IUserRepository userRepo,
        IPasswordHasher passwordHasher,
        ITokenService tokenService,
        CancellationToken ct)
    {
        var validation = await validator.ValidateAsync(request, ct);
        if (!validation.IsValid)
        {
            return Results.ValidationProblem(validation.ToDictionary());
        }

        var user = await userRepo.GetByEmailAsync(request.Email, ct);
        if (user is null || !passwordHasher.VerifyPassword(request.Password, user.PasswordHash))
        {
            return Results.Problem(
                title: "Invalid credentials",
                detail: "Invalid email or password.",
                statusCode: StatusCodes.Status401Unauthorized);
        }

        var tokens = tokenService.GenerateTokens(user);
        await userRepo.UpdateRefreshTokenAsync(user.Id, tokens.RefreshToken, tokens.RefreshTokenExpiresAt, ct);

        var profileDto = new UserProfileDto(
            user.Id,
            user.Email,
            user.Name,
            user.SalaryPaise,
            user.Payday,
            user.SavingsGoalPaise,
            user.Timezone);

        return Results.Ok(new AuthResponse(tokens.AccessToken, tokens.RefreshToken, profileDto));
    }

    private static async Task<IResult> RefreshTokenAsync(
        [FromBody] RefreshTokenRequest request,
        IValidator<RefreshTokenRequest> validator,
        IUserRepository userRepo,
        ITokenService tokenService,
        CancellationToken ct)
    {
        var validation = await validator.ValidateAsync(request, ct);
        if (!validation.IsValid)
        {
            return Results.ValidationProblem(validation.ToDictionary());
        }

        var user = await userRepo.GetByRefreshTokenAsync(request.RefreshToken, ct);
        if (user is null)
        {
            return Results.Problem(
                title: "Invalid token",
                detail: "Invalid or expired refresh token.",
                statusCode: StatusCodes.Status401Unauthorized);
        }

        var tokens = tokenService.GenerateTokens(user);
        await userRepo.UpdateRefreshTokenAsync(user.Id, tokens.RefreshToken, tokens.RefreshTokenExpiresAt, ct);

        var profileDto = new UserProfileDto(
            user.Id,
            user.Email,
            user.Name,
            user.SalaryPaise,
            user.Payday,
            user.SavingsGoalPaise,
            user.Timezone);

        return Results.Ok(new AuthResponse(tokens.AccessToken, tokens.RefreshToken, profileDto));
    }

    private static async Task<IResult> GetProfileAsync(
        ClaimsPrincipal principal,
        IUserRepository userRepo,
        CancellationToken ct)
    {
        var userId = GetUserId(principal);
        if (userId is null) return Results.Unauthorized();

        var user = await userRepo.GetByIdAsync(userId, ct);
        if (user is null) return Results.NotFound();

        return Results.Ok(new UserProfileDto(
            user.Id,
            user.Email,
            user.Name,
            user.SalaryPaise,
            user.Payday,
            user.SavingsGoalPaise,
            user.Timezone));
    }

    private static async Task<IResult> UpdateProfileAsync(
        ClaimsPrincipal principal,
        [FromBody] UpdateProfileRequest request,
        IValidator<UpdateProfileRequest> validator,
        IUserRepository userRepo,
        CancellationToken ct)
    {
        var userId = GetUserId(principal);
        if (userId is null) return Results.Unauthorized();

        var validation = await validator.ValidateAsync(request, ct);
        if (!validation.IsValid)
        {
            return Results.ValidationProblem(validation.ToDictionary());
        }

        var updated = await userRepo.UpdateProfileAsync(
            userId,
            request.Name,
            request.SalaryPaise,
            request.Payday,
            request.SavingsGoalPaise,
            request.Timezone,
            ct);

        if (updated is null) return Results.NotFound();

        return Results.Ok(new UserProfileDto(
            updated.Id,
            updated.Email,
            updated.Name,
            updated.SalaryPaise,
            updated.Payday,
            updated.SavingsGoalPaise,
            updated.Timezone));
    }

    private static async Task<IResult> GetFixedExpensesAsync(
        ClaimsPrincipal principal,
        IFixedExpenseRepository fixedExpenseRepo,
        CancellationToken ct)
    {
        var userId = GetUserId(principal);
        if (userId is null) return Results.Unauthorized();

        var items = await fixedExpenseRepo.GetAllAsync(userId, ct);
        var dtos = items.Select(i => new FixedExpenseItemDto(i.Id, i.Name, i.AmountPaise, i.DueDay));
        return Results.Ok(dtos);
    }

    private static async Task<IResult> UpdateFixedExpensesAsync(
        ClaimsPrincipal principal,
        [FromBody] List<FixedExpenseItemDto> items,
        IValidator<FixedExpenseItemDto> itemValidator,
        IFixedExpenseRepository fixedExpenseRepo,
        CancellationToken ct)
    {
        var userId = GetUserId(principal);
        if (userId is null) return Results.Unauthorized();

        items ??= [];

        for (var i = 0; i < items.Count; i++)
        {
            var item = items[i];
            var validation = await itemValidator.ValidateAsync(item, ct);
            if (!validation.IsValid)
            {
                return Results.ValidationProblem(validation.ToDictionary());
            }
        }

        var domainItems = items.Select(i => new FixedExpense
        {
            Id = i.Id ?? Guid.NewGuid().ToString("N"),
            UserId = userId,
            Name = i.Name.Trim(),
            AmountPaise = i.AmountPaise,
            DueDay = i.DueDay,
            CreatedAt = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds()
        });

        var saved = await fixedExpenseRepo.ReplaceAllAsync(userId, domainItems, ct);
        var dtos = saved.Select(i => new FixedExpenseItemDto(i.Id, i.Name, i.AmountPaise, i.DueDay));
        return Results.Ok(dtos);
    }

    private static async Task<IResult> DeleteAccountAsync(
        ClaimsPrincipal principal,
        IUserRepository userRepo,
        CancellationToken ct)
    {
        var userId = GetUserId(principal);
        if (userId is null) return Results.Unauthorized();

        var deleted = await userRepo.DeleteAllUserDataAsync(userId, ct);
        return deleted ? Results.NoContent() : Results.NotFound();
    }

    private static async Task<IResult> SyncTransactionsAsync(
        ClaimsPrincipal principal,
        [FromBody] SyncTransactionsRequest request,
        IValidator<SyncTransactionsRequest> validator,
        ITransactionRepository transactionRepo,
        CancellationToken ct)
    {
        var userId = GetUserId(principal);
        if (userId is null) return Results.Unauthorized();

        var validation = await validator.ValidateAsync(request, ct);
        if (!validation.IsValid)
        {
            return Results.ValidationProblem(validation.ToDictionary());
        }

        var nowMs = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
        var domainTxs = request.Transactions.Select(t => new Transaction
        {
            Id = t.Id ?? Guid.NewGuid().ToString("N"),
            UserId = userId,
            AmountPaise = t.AmountPaise,
            Direction = t.Direction.Trim().ToLowerInvariant(),
            Merchant = t.Merchant?.Trim(),
            MerchantNorm = t.MerchantNorm?.Trim(),
            Vpa = t.Vpa?.Trim(),
            Mode = t.Mode?.Trim() ?? "UPI",
            AccountLast4 = t.AccountLast4?.Trim(),
            UpiRef = t.UpiRef?.Trim(),
            BalancePaise = t.BalancePaise,
            Category = t.Category.Trim(),
            NeedsReview = t.NeedsReview,
            Note = t.Note?.Trim(),
            Source = t.Source?.Trim() ?? "sms",
            OccurredAt = t.OccurredAt,
            DedupeHash = t.DedupeHash.Trim().ToLowerInvariant(),
            IsExcluded = t.IsExcluded,
            CreatedAt = t.CreatedAt ?? nowMs,
            UpdatedAt = t.UpdatedAt ?? nowMs
        });

        var result = await transactionRepo.SyncBatchAsync(userId, domainTxs, ct);
        return Results.Ok(result);
    }

    private static async Task<IResult> GetTransactionsAsync(
        ClaimsPrincipal principal,
        [FromQuery] long? from,
        [FromQuery] long? to,
        [FromQuery] string? category,
        [FromQuery] int? page,
        [FromQuery] int? pageSize,
        ITransactionRepository transactionRepo,
        CancellationToken ct)
    {
        var userId = GetUserId(principal);
        if (userId is null) return Results.Unauthorized();

        var result = await transactionRepo.GetAsync(
            userId,
            from,
            to,
            category,
            page ?? 1,
            pageSize ?? 50,
            ct);

        return Results.Ok(result);
    }

    private static async Task<IResult> PatchTransactionAsync(
        ClaimsPrincipal principal,
        [FromRoute] string id,
        [FromBody] PatchTransactionRequest request,
        IValidator<PatchTransactionRequest> validator,
        ITransactionRepository transactionRepo,
        CancellationToken ct)
    {
        var userId = GetUserId(principal);
        if (userId is null) return Results.Unauthorized();

        var validation = await validator.ValidateAsync(request, ct);
        if (!validation.IsValid)
        {
            return Results.ValidationProblem(validation.ToDictionary());
        }

        var updated = await transactionRepo.UpdateAsync(
            userId,
            id,
            request.Category,
            request.IsExcluded,
            request.Note,
            ct);

        if (updated is null)
        {
            return Results.NotFound();
        }

        return Results.Ok(updated);
    }

    private static async Task<IResult> GetCycleInsightsAsync(
        ClaimsPrincipal principal,
        IUserRepository userRepo,
        IInsightsService insightsService,
        CancellationToken ct)
    {
        var userId = GetUserId(principal);
        if (userId is null) return Results.Unauthorized();

        var user = await userRepo.GetByIdAsync(userId, ct);
        if (user is null) return Results.NotFound();

        var insights = await insightsService.GetCycleInsightsAsync(userId, user, ct);
        return Results.Ok(insights);
    }

    private static async Task<IResult> GetDailyInsightsAsync(
        ClaimsPrincipal principal,
        IUserRepository userRepo,
        IInsightsService insightsService,
        CancellationToken ct)
    {
        var userId = GetUserId(principal);
        if (userId is null) return Results.Unauthorized();

        var user = await userRepo.GetByIdAsync(userId, ct);
        if (user is null) return Results.NotFound();

        var daily = await insightsService.GetDailyInsightsAsync(userId, user, ct);
        return Results.Ok(daily);
    }

    private static string? GetUserId(ClaimsPrincipal principal)
    {
        return principal.FindFirstValue(ClaimTypes.NameIdentifier)
            ?? principal.FindFirstValue("sub");
    }
}
