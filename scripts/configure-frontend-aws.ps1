$ErrorActionPreference = "Stop"
$REGION = "ap-south-1"
$ProjectRoot = Split-Path -Parent $PSScriptRoot

Write-Host "Finding AWS Ticketing resources in $REGION..." -ForegroundColor Cyan
$POOL_ID = aws cognito-idp list-user-pools --max-results 60 --region $REGION --query "UserPools[?Name=='ticketing-pool'].Id | [0]" --output text
if (-not $POOL_ID -or $POOL_ID -eq "None") { throw "Cognito pool 'ticketing-pool' was not found." }
$CLIENT_ID = aws cognito-idp list-user-pool-clients --user-pool-id $POOL_ID --max-results 60 --region $REGION --query "UserPoolClients[?ClientName=='ticketing-spa'].ClientId | [0]" --output text
if (-not $CLIENT_ID -or $CLIENT_ID -eq "None") { throw "Cognito app client 'ticketing-spa' was not found." }
$API_ID = aws apigatewayv2 get-apis --region $REGION --query "Items[?Name=='ticketing-api'].ApiId | [0]" --output text
if (-not $API_ID -or $API_ID -eq "None") { throw "API Gateway 'ticketing-api' was not found." }
$API_ENDPOINT = aws apigatewayv2 get-api --api-id $API_ID --region $REGION --query "ApiEndpoint" --output text

$envText = @"
VITE_API_URL=$API_ENDPOINT
VITE_COGNITO_AUTHORITY=https://cognito-idp.$REGION.amazonaws.com/$POOL_ID
VITE_COGNITO_CLIENT_ID=$CLIENT_ID
VITE_REDIRECT_URI=http://localhost:5173/callback
VITE_COGNITO_LOGOUT_URI=http://localhost:5173/
VITE_COGNITO_SCOPE=openid email profile
"@
$envPath = Join-Path $ProjectRoot "frontend\.env.local"
[System.IO.File]::WriteAllText($envPath,$envText,[System.Text.UTF8Encoding]::new($false))
Write-Host "`nFrontend AWS configuration written:" -ForegroundColor Green
Write-Host "  $envPath"
Write-Host "  API:    $API_ENDPOINT"
Write-Host "  Pool:   $POOL_ID"
Write-Host "  Client: $CLIENT_ID"
Write-Host "`nRestart Vite after running this script." -ForegroundColor Yellow
