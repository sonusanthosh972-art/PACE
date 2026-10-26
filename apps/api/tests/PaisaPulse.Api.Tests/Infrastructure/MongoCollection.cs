namespace PaisaPulse.Api.Tests.Infrastructure;

[CollectionDefinition("Mongo")]
public sealed class MongoTestGroupFixture : ICollectionFixture<MongoServerFixture>;
