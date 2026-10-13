[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [ValidateSet("Customer1", "Customer2")]
    [string]$CustomerLabel,

    [ValidateRange(1, 100)]
    [int]$Count = 100,

    [switch]$Execute
)

$ErrorActionPreference = "Stop"
$ApiBase = "https://z4mvpi40k8.execute-api.ap-south-1.amazonaws.com"
$RunId = Get-Date -Format "yyyyMMdd-HHmmss"
$Marker = "BULKTEST-$RunId-$CustomerLabel"
$OutFile = Join-Path (Get-Location) "seeded-tickets-$CustomerLabel-$RunId.json"

$subjects = @(
    @{ Category = "Technical Issue"; Priority = "Medium"; Subject = "Page intermittently fails to load"; Detail = "A test user reports that a page sometimes fails to load on the first attempt. Please review browser console and network behavior." },
    @{ Category = "Access & Accounts"; Priority = "High"; Subject = "Test account sign-in troubleshooting"; Detail = "A test user cannot consistently complete sign-in. Please verify the expected authentication flow and session behavior." },
    @{ Category = "Billing"; Priority = "Low"; Subject = "Question about invoice display"; Detail = "The invoice summary in this test scenario appears unclear. Please confirm the displayed totals and labels are understandable." },
    @{ Category = "Account Settings"; Priority = "Medium"; Subject = "Profile preference does not persist"; Detail = "A test user changes a profile preference, navigates away, and returns to find the previous value. Please investigate persistence." },
    @{ Category = "Other"; Priority = "Low"; Subject = "General usability feedback"; Detail = "This is a generated test ticket for checking the support workflow, ticket listing, and status display." }
)

Write-Host ""
Write-Host "Ticket API: $ApiBase"
Write-Host "Customer label: $CustomerLabel"
Write-Host "Requested count: $Count"
Write-Host "Unique marker: $Marker"
Write-Host "Output file: $OutFile"
Write-Host ""

if (-not $Execute) {
    Write-Host "DRY RUN ONLY: no requests will create tickets." -ForegroundColor Yellow
    Write-Host "Example title: [$Marker-001] $($subjects[0].Subject)"
    Write-Host ""
    Write-Host "When ready, sign into the correct customer account in the live app, then run this script again with -Execute."
    exit 0
}

Write-Host "IMPORTANT: Make sure the browser is signed in as the intended CUSTOMER account: $CustomerLabel." -ForegroundColor Yellow
$confirmAccount = Read-Host "Type the exact customer email you signed in as to continue"
if ([string]::IsNullOrWhiteSpace($confirmAccount) -or $confirmAccount -notmatch "^[^@\s]+@[^@\s]+\.[^@\s]+$") {
    throw "A valid email is required. No tickets were created."
}

$secureToken = Read-Host "Paste that account's Cognito ACCESS token (input is hidden)" -AsSecureString
$ptr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secureToken)
try {
    $token = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($ptr)
}
finally {
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr)
    $secureToken.Dispose()
}

if ([string]::IsNullOrWhiteSpace($token)) {
    throw "No token entered. No tickets were created."
}

$headers = @{ Authorization = "Bearer $token" }
try {
    Write-Host "Checking authenticated API access..."
    $null = Invoke-RestMethod -Method Get -Uri "$ApiBase/tickets" -Headers $headers -TimeoutSec 30
}
catch {
    $token = $null
    $headers = $null
    throw "Authenticated GET /tickets failed. Check that you copied the ACCESS token from the intended signed-in account. No tickets were created. Details: $($_.Exception.Message)"
}

Write-Host "Authenticated GET succeeded. The API does not expose a verified identity endpoint here, so confirm the email above matches the signed-in account." -ForegroundColor Yellow
$identityConfirm = Read-Host "Type CONFIRM to confirm the token belongs to $confirmAccount"
if ($identityConfirm -cne "CONFIRM") {
    $token = $null
    $headers = $null
    throw "Identity confirmation did not match. No tickets were created."
}

$created = [System.Collections.Generic.List[object]]::new()
$failures = [System.Collections.Generic.List[string]]::new()
$stoppedAfterTest = $false

$testOnly = Read-Host "Create ONE test ticket first? Type TEST to proceed"
if ($testOnly -cne "TEST") {
    $token = $null
    $headers = $null
    throw "Cancelled before any ticket was created."
}

for ($i = 1; $i -le $Count; $i++) {
    $sample = $subjects[($i - 1) % $subjects.Count]
    $suffix = "{0:D3}" -f $i
    $title = "[$Marker-$suffix] $($sample.Subject)"
    if ($title.Length -gt 120) { $title = $title.Substring(0, 120) }

    $body = @{
        title = $title
        description = "$($sample.Detail) Batch marker: $Marker; generated item $suffix of $Count. This ticket was created for test-data validation."
        category = $sample.Category
        priority = $sample.Priority
    } | ConvertTo-Json -Depth 5

    try {
        $response = Invoke-RestMethod -Method Post -Uri "$ApiBase/tickets" -Headers $headers -ContentType "application/json" -Body $body -TimeoutSec 30
        $ticket = if ($response.ticket) { $response.ticket } else { $response }
        $ticketId = if ($ticket.ticketId) { $ticket.ticketId } elseif ($ticket.id) { $ticket.id } else { "ID_NOT_RETURNED" }

        $created.Add([pscustomobject]@{
            index = $i
            ticketId = $ticketId
            title = $title
            category = $sample.Category
            priority = $sample.Priority
            createdAt = (Get-Date).ToString("o")
        })

        Write-Progress -Activity "Creating test tickets" -Status "$i of $Count created" -PercentComplete (($i / $Count) * 100)
        Write-Host "Created $i/$Count : $ticketId"

        if ($i -eq 1 -and $Count -gt 1) {
            Write-Host ""
            Write-Host "The first ticket has been created. Check the live dashboard now before continuing." -ForegroundColor Yellow
            $continueBatch = Read-Host "If the ticket appears correctly under the intended customer, type CONTINUE to create the remaining $($Count - 1)"
            if ($continueBatch -cne "CONTINUE") {
                Write-Host "Stopping after the first test ticket as requested. It was not deleted." -ForegroundColor Yellow
                $stoppedAfterTest = $true
                break
            }
        }
    }
    catch {
        $failures.Add("Item $i failed: $($_.Exception.Message)")
        Write-Progress -Activity "Creating test tickets" -Completed
        Write-Warning "Stopped at item $i. No further tickets will be attempted."
        break
    }
}

Write-Progress -Activity "Creating test tickets" -Completed
$result = [pscustomobject]@{
    api = $ApiBase
    customerLabel = $CustomerLabel
    confirmedEmail = $confirmAccount
    marker = $Marker
    requested = $Count
    createdCount = $created.Count
    failures = @($failures)
    tickets = @($created)
}
$result | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath $OutFile -Encoding UTF8

$token = $null
$headers = $null

Write-Host ""
Write-Host "Finished. Created: $($created.Count) / $Count"
Write-Host "Results saved to: $OutFile"
if ($failures.Count -gt 0) {
    Write-Host "Batch stopped due to an error. Review the saved results before retrying." -ForegroundColor Red
    $failures | ForEach-Object { Write-Host $_ -ForegroundColor Red }
    exit 1
}
if ($stoppedAfterTest) {
    Write-Host "Test checkpoint complete: one ticket created. Batch intentionally paused." -ForegroundColor Yellow
} elseif ($created.Count -eq $Count) {
    Write-Host "Completed successfully." -ForegroundColor Green
}
