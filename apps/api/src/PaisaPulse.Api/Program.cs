using PaisaPulse.Api.Configuration;

var dotEnvPath = DotEnv.Find(Directory.GetCurrentDirectory());
if (dotEnvPath is not null)
{
    DotEnv.Load(dotEnvPath);
}

var builder = WebApplication.CreateBuilder(args);

// Environment variables win; user-secrets (Development only) are the fallback.
ApiSettings settings;
try
{
    settings = ApiSettings.FromEnvironment(name => Environment.GetEnvironmentVariable(name) ?? builder.Configuration[name]);
}
catch (InvalidOperationException ex)
{
    await Console.Error.WriteLineAsync($"Startup aborted: {ex.Message}");
    return 1;
}

builder.Services.AddSingleton(settings);

var app = builder.Build();

await app.RunAsync();
return 0;
