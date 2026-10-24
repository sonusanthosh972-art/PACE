using PaisaPulse.Api.Configuration;

namespace PaisaPulse.Api.Tests.Configuration;

public sealed class DotEnvTests
{
    [Fact]
    public void ParseReadsKeyValuePairsAndSkipsCommentsAndBlankLines()
    {
        var result = DotEnv.Parse(["# comment", "", "  ", "A=1", "B = two "]);

        Assert.Equal(2, result.Count);
        Assert.Equal("1", result["A"]);
        Assert.Equal("two", result["B"]);
    }

    [Fact]
    public void ParseStripsMatchingQuotesAndExportPrefix()
    {
        var result = DotEnv.Parse(["export A=\"quoted value\"", "B='single'", "C=\"unbalanced'"]);

        Assert.Equal("quoted value", result["A"]);
        Assert.Equal("single", result["B"]);
        Assert.Equal("\"unbalanced'", result["C"]);
    }

    [Fact]
    public void ParseKeepsEqualsSignsInsideValue()
    {
        var result = DotEnv.Parse(["MONGODB_URI=mongodb+srv://u:p@c/db?retryWrites=true&w=majority"]);

        Assert.Equal("mongodb+srv://u:p@c/db?retryWrites=true&w=majority", result["MONGODB_URI"]);
    }

    [Fact]
    public void ParseIgnoresLinesWithoutKey()
    {
        var result = DotEnv.Parse(["=nokey", "novalue"]);

        Assert.Empty(result);
    }

    [Fact]
    public void LoadDoesNotOverrideExistingEnvironmentVariables()
    {
        var key = $"PP_TEST_{Guid.NewGuid():N}";
        var path = Path.GetTempFileName();
        try
        {
            File.WriteAllLines(path, [$"{key}=from-file"]);
            Environment.SetEnvironmentVariable(key, "from-env");

            DotEnv.Load(path);

            Assert.Equal("from-env", Environment.GetEnvironmentVariable(key));
        }
        finally
        {
            Environment.SetEnvironmentVariable(key, null);
            File.Delete(path);
        }
    }

    [Fact]
    public void FindWalksUpParentDirectories()
    {
        var root = Directory.CreateTempSubdirectory("pp-dotenv-");
        try
        {
            var nested = Directory.CreateDirectory(Path.Combine(root.FullName, "a", "b"));
            var envPath = Path.Combine(root.FullName, DotEnv.FileName);
            File.WriteAllText(envPath, "X=1");

            Assert.Equal(envPath, DotEnv.Find(nested.FullName));
        }
        finally
        {
            root.Delete(recursive: true);
        }
    }
}
