using Mongo2Go;
using MongoDB.Driver;

namespace PaisaPulse.Api.Tests.Infrastructure;

public sealed class MongoServerFixture : IDisposable
{
    private readonly MongoDbRunner _runner;

    public MongoServerFixture()
    {
        var nugetRoot = Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.UserProfile),
            ".nuget", "packages", "mongo2go", "5.0.0", "tools");

        _runner = MongoDbRunner.Start(binariesSearchDirectory: nugetRoot);
        Client = new MongoClient(_runner.ConnectionString);
    }

    public string ConnectionString => _runner.ConnectionString;

    public MongoClient Client { get; }

    public IMongoDatabase CreateNewDatabase(string? prefix = null)
    {
        var name = $"{prefix ?? "test"}_{Guid.NewGuid():N}";
        return Client.GetDatabase(name);
    }

    public void Dispose()
    {
        _runner.Dispose();
    }
}
