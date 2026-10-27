# Build stage
FROM mcr.microsoft.com/dotnet/sdk:10.0 AS build
WORKDIR /app

# Copy props and csproj for layer caching
COPY Directory.Build.props Directory.Packages.props ./
COPY src/PaisaPulse.Api/PaisaPulse.Api.csproj src/PaisaPulse.Api/

# Restore dependencies
RUN dotnet restore src/PaisaPulse.Api/PaisaPulse.Api.csproj

# Copy source files
COPY src/PaisaPulse.Api/ src/PaisaPulse.Api/

# Publish release binary
WORKDIR /app/src/PaisaPulse.Api
RUN dotnet publish -c Release -o /out --no-restore

# Production runtime stage
FROM mcr.microsoft.com/dotnet/aspnet:10.0 AS runtime
WORKDIR /app

COPY --from=build /out ./

# Environment defaults
ENV ASPNETCORE_ENVIRONMENT=Production
ENV DOTNET_PRINT_TELEMETRY_MESSAGE=false

# Expose default fallback port (Render overrides with $PORT automatically)
EXPOSE 5080

ENTRYPOINT ["dotnet", "PaisaPulse.Api.dll"]
