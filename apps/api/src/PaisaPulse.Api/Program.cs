using System.Text;
using System.Threading.RateLimiting;
using FluentValidation;
using Hangfire;
using Hangfire.Mongo;
using Hangfire.Mongo.Migration.Strategies;
using Hangfire.Mongo.Migration.Strategies.Backup;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.IdentityModel.Tokens;
using MongoDB.Driver;
using PaisaPulse.Api.Configuration;
using PaisaPulse.Api.Data;
using PaisaPulse.Api.Data.Repositories;
using PaisaPulse.Api.Endpoints;
using PaisaPulse.Api.Jobs;
using PaisaPulse.Api.Services;
using PaisaPulse.Api.Validation;
using Serilog;
using Serilog.Events;

var dotEnvPath = DotEnv.Find(Directory.GetCurrentDirectory());
if (dotEnvPath is not null)
{
    DotEnv.Load(dotEnvPath);
}

Log.Logger = new LoggerConfiguration()
    .MinimumLevel.Information()
    .MinimumLevel.Override("Microsoft", LogEventLevel.Warning)
    .MinimumLevel.Override("Microsoft.AspNetCore", LogEventLevel.Warning)
    .MinimumLevel.Override("Hangfire", LogEventLevel.Warning)
    .Enrich.FromLogContext()
    .WriteTo.Console(
        outputTemplate: "[{Timestamp:HH:mm:ss} {Level:u3}] {Message:lj}{NewLine}{Exception}",
        formatProvider: System.Globalization.CultureInfo.InvariantCulture)
    .CreateLogger();

var builder = WebApplication.CreateBuilder(args);
builder.Host.UseSerilog();

var port = Environment.GetEnvironmentVariable("PORT");
var defaultUrl = string.IsNullOrWhiteSpace(port) ? "http://0.0.0.0:5080" : $"http://0.0.0.0:{port}";
var serverUrls = builder.Configuration["ASPNETCORE_URLS"]
    ?? Environment.GetEnvironmentVariable("ASPNETCORE_URLS")
    ?? defaultUrl;
builder.WebHost.UseUrls(serverUrls);

// Environment variables win; user-secrets (Development only) are the fallback.
ApiSettings settings;
try
{
    settings = ApiSettings.FromEnvironment(name => builder.Configuration[name] ?? Environment.GetEnvironmentVariable(name));
}
catch (InvalidOperationException ex)
{
    await Console.Error.WriteLineAsync($"Startup aborted: {ex.Message}");
    return 1;
}

builder.Services.AddSingleton(settings);
builder.Services.AddProblemDetails();

// MongoDB Client and Database
builder.Services.AddSingleton<IMongoClient>(_ => new MongoClient(settings.MongoDbUri));
builder.Services.AddScoped<IMongoDatabase>(sp => sp.GetRequiredService<IMongoClient>().GetDatabase(settings.DatabaseName));

// Repositories
builder.Services.AddScoped<IUserRepository, UserRepository>();
builder.Services.AddScoped<IFixedExpenseRepository, FixedExpenseRepository>();
builder.Services.AddScoped<ITransactionRepository, TransactionRepository>();
builder.Services.AddScoped<IUserRuleRepository, UserRuleRepository>();
builder.Services.AddScoped<IDailySummaryRepository, DailySummaryRepository>();

// Services
builder.Services.AddScoped<ITokenService, TokenService>();
builder.Services.AddScoped<IPasswordHasher, PasswordHasher>();
builder.Services.AddScoped<IInsightsService, InsightsService>();
builder.Services.AddScoped<IDailySummaryJob, DailySummaryJob>();

// FluentValidation
builder.Services.AddValidatorsFromAssemblyContaining<RegisterRequestValidator>();

// Authentication & JWT
builder.Services.AddAuthentication(JwtBearerDefaults.AuthenticationScheme)
    .AddJwtBearer(options =>
    {
        options.TokenValidationParameters = new TokenValidationParameters
        {
            ValidateIssuerSigningKey = true,
            IssuerSigningKey = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(settings.JwtSecret)),
            ValidateIssuer = true,
            ValidIssuer = settings.JwtIssuer,
            ValidateAudience = true,
            ValidAudience = settings.JwtAudience,
            ValidateLifetime = true,
            ClockSkew = TimeSpan.FromMinutes(1)
        };
    });

builder.Services.AddAuthorization();

// Rate Limiting
builder.Services.AddRateLimiter(options =>
{
    options.RejectionStatusCode = StatusCodes.Status429TooManyRequests;
    options.AddFixedWindowLimiter("auth", opt =>
    {
        opt.PermitLimit = 10;
        opt.Window = TimeSpan.FromMinutes(1);
        opt.QueueLimit = 0;
    });
    options.AddFixedWindowLimiter("api", opt =>
    {
        opt.PermitLimit = 100;
        opt.Window = TimeSpan.FromMinutes(1);
        opt.QueueLimit = 0;
    });
});

// CORS
// CORS: Locked down. Mobile app uses native networking and does not require browser CORS.
// CORS is only registered if explicit, non-wildcard origins are configured.
var corsOrigins = settings.CorsOrigins.Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);
var hasExplicitCors = corsOrigins.Length > 0 && !corsOrigins.Contains("*");
if (hasExplicitCors)
{
    builder.Services.AddCors(options =>
    {
        options.AddPolicy("PaisaPulseCors", policy =>
            policy.WithOrigins(corsOrigins).AllowAnyHeader().AllowAnyMethod());
    });
}

// Hangfire for Nightly Jobs
builder.Services.AddHangfire(configuration => configuration
    .SetDataCompatibilityLevel(CompatibilityLevel.Version_180)
    .UseSimpleAssemblyNameTypeSerializer()
    .UseRecommendedSerializerSettings()
    .UseMongoStorage(settings.MongoDbUri, settings.DatabaseName, new MongoStorageOptions
    {
        MigrationOptions = new MongoMigrationOptions
        {
            MigrationStrategy = new MigrateMongoMigrationStrategy(),
            BackupStrategy = new NoneMongoBackupStrategy()
        },
        Prefix = "hangfire",
        CheckConnection = false
    }));
builder.Services.AddHangfireServer();

var app = builder.Build();

app.UseExceptionHandler();
app.UseStatusCodePages();

// HTTPS policy: Enforced in production; in development allow HTTP for local phone/emulator development
if (!app.Environment.IsDevelopment())
{
    app.UseHsts();
    app.UseHttpsRedirection();
}

if (hasExplicitCors)
{
    app.UseCors("PaisaPulseCors");
}
app.UseRateLimiter();
app.UseAuthentication();
app.UseAuthorization();

// Map API endpoints
app.MapPaisaPulseEndpoints();

// Initialize MongoDB indexes on startup (must fail fast to prevent duplicate payments)
try
{
    using var scope = app.Services.CreateScope();
    var database = scope.ServiceProvider.GetRequiredService<IMongoDatabase>();
    await IndexInitializer.InitializeAsync(database);
}
catch (Exception ex)
{
    Log.Fatal(ex, "MongoDB index initialization failed on startup. Aborting startup to prevent duplicate payments.");
    throw new InvalidOperationException("Failed to initialize MongoDB indexes on startup.", ex);
}

// Schedule Nightly Hangfire Job at midnight IST (00:00 IST)
try
{
    TimeZoneInfo istTz;
    try
    {
        istTz = TimeZoneInfo.FindSystemTimeZoneById("Asia/Kolkata");
    }
    catch (TimeZoneNotFoundException)
    {
        try
        {
            istTz = TimeZoneInfo.FindSystemTimeZoneById("India Standard Time");
        }
        catch (TimeZoneNotFoundException)
        {
            istTz = TimeZoneInfo.Utc;
        }
    }

    RecurringJob.AddOrUpdate<IDailySummaryJob>(
        "nightly-daily-summaries",
        job => job.ExecuteAsync(CancellationToken.None),
        "0 0 * * *",
        new RecurringJobOptions { TimeZone = istTz });
}
catch (Exception ex)
{
    Log.Warning(ex, "Hangfire recurring job registration deferred: {Message}", ex.Message);
}

await app.RunAsync();
return 0;

public partial class Program;
