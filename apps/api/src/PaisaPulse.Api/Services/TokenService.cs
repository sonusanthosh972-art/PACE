using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Security.Cryptography;
using System.Text;
using Microsoft.IdentityModel.Tokens;
using PaisaPulse.Api.Configuration;
using PaisaPulse.Api.Domain;

namespace PaisaPulse.Api.Services;

internal sealed record TokenResult(string AccessToken, string RefreshToken, DateTime RefreshTokenExpiresAt);

internal interface ITokenService
{
    TokenResult GenerateTokens(User user);
}

internal sealed class TokenService(ApiSettings settings) : ITokenService
{
    private static readonly TimeSpan AccessTokenLifetime = TimeSpan.FromMinutes(15);
    private static readonly TimeSpan RefreshTokenLifetime = TimeSpan.FromDays(30);

    public TokenResult GenerateTokens(User user)
    {
        ArgumentNullException.ThrowIfNull(user);

        var key = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(settings.JwtSecret));
        var credentials = new SigningCredentials(key, SecurityAlgorithms.HmacSha256);

        var claims = new[]
        {
            new Claim(JwtRegisteredClaimNames.Sub, user.Id),
            new Claim(ClaimTypes.NameIdentifier, user.Id),
            new Claim(JwtRegisteredClaimNames.Email, user.Email),
            new Claim(JwtRegisteredClaimNames.Name, user.Name),
            new Claim(JwtRegisteredClaimNames.Jti, Guid.NewGuid().ToString("N"))
        };

        var now = DateTime.UtcNow;
        var tokenDescriptor = new SecurityTokenDescriptor
        {
            Subject = new ClaimsIdentity(claims),
            Expires = now.Add(AccessTokenLifetime),
            Issuer = settings.JwtIssuer,
            Audience = settings.JwtAudience,
            SigningCredentials = credentials
        };

        var handler = new JwtSecurityTokenHandler();
        var securityToken = handler.CreateToken(tokenDescriptor);
        var accessToken = handler.WriteToken(securityToken);

        var refreshTokenBytes = RandomNumberGenerator.GetBytes(48);
        var refreshToken = Convert.ToBase64String(refreshTokenBytes)
            .Replace("+", "-")
            .Replace("/", "_")
            .TrimEnd('=');

        var refreshExpires = now.Add(RefreshTokenLifetime);

        return new TokenResult(accessToken, refreshToken, refreshExpires);
    }
}
