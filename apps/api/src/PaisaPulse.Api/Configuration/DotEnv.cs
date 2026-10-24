namespace PaisaPulse.Api.Configuration;

/// <summary>
/// Minimal .env loader for local development. Values already present in the real
/// environment always win, so production (where no .env exists) is unaffected.
/// Values are never logged.
/// </summary>
internal static class DotEnv
{
    public const string FileName = ".env";

    /// <summary>Walks up from <paramref name="startDirectory"/> looking for a .env file.</summary>
    public static string? Find(string startDirectory)
    {
        for (var dir = new DirectoryInfo(startDirectory); dir is not null; dir = dir.Parent)
        {
            var candidate = Path.Combine(dir.FullName, FileName);
            if (File.Exists(candidate))
            {
                return candidate;
            }
        }

        return null;
    }

    /// <summary>Loads the file into the process environment without overriding existing variables.</summary>
    public static void Load(string path)
    {
        foreach (var (key, value) in Parse(File.ReadLines(path)))
        {
            if (Environment.GetEnvironmentVariable(key) is null)
            {
                Environment.SetEnvironmentVariable(key, value);
            }
        }
    }

    public static IReadOnlyDictionary<string, string> Parse(IEnumerable<string> lines)
    {
        var result = new Dictionary<string, string>(StringComparer.Ordinal);

        foreach (var rawLine in lines)
        {
            var line = rawLine.Trim();
            if (line.Length == 0 || line.StartsWith('#'))
            {
                continue;
            }

            if (line.StartsWith("export ", StringComparison.Ordinal))
            {
                line = line["export ".Length..].TrimStart();
            }

            var separator = line.IndexOf('=', StringComparison.Ordinal);
            if (separator <= 0)
            {
                continue;
            }

            var key = line[..separator].Trim();
            var value = line[(separator + 1)..].Trim();

            if (value.Length >= 2 && (value[0] == '"' || value[0] == '\'') && value[^1] == value[0])
            {
                value = value[1..^1];
            }

            result[key] = value;
        }

        return result;
    }
}
