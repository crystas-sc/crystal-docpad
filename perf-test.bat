@echo off
setlocal enabledelayedexpansion

echo === [1/4] Building reproducible Docker image (crystal-docpad:perf) ===
docker build --platform linux/amd64 -t crystal-docpad:perf .
if errorlevel 1 (
  echo Docker build failed.
  exit /b 1
)

echo.
echo === [2/4] Starting constrained container (docpad-perf) ===
docker rm -f docpad-perf >nul 2>&1
docker run -d --name docpad-perf --platform linux/amd64 --cpus="2.0" --memory="2g" --memory-swap="2g" --shm-size="1g" -p 3000:3000 --tmpfs /app/data:rw,size=256m crystal-docpad:perf
if errorlevel 1 (
  echo Failed to start container.
  exit /b 1
)

echo.
echo === [3/4] Waiting for http://localhost:3000/api/health ===
powershell -NoProfile -Command ^
  "for ($i=0; $i -lt 30; $i++) { try { $r = Invoke-WebRequest -UseBasicParsing -Uri 'http://localhost:3000/api/health' -TimeoutSec 2; if ($r.StatusCode -eq 200) { Write-Host 'Server ready.'; exit 0 } } catch {}; Start-Sleep -Seconds 1 }; Write-Error 'Server did not become ready in time.'; exit 1"
if errorlevel 1 (
  docker logs docpad-perf
  exit /b 1
)

echo.
echo === [4/4] Downloading initial PDF + DOCX and running 100-run PDF benchmark ===
powershell -NoProfile -Command ^
  "$doc = Get-Content 'anthropic-sample-report.json' -Raw | ConvertFrom-Json;" ^
  "$pdfBody = @{ format='pdf'; title='Anthropic 10-Chart Perf Test'; documentJson=$doc } | ConvertTo-Json -Depth 20;" ^
  "$docxBody = @{ format='docx'; title='Anthropic 10-Chart Perf Test'; documentJson=$doc } | ConvertTo-Json -Depth 20;" ^
  "Write-Host 'Downloading first PDF -> perf-output.pdf (warms up Chromium pool)...';" ^
  "Invoke-WebRequest -Uri 'http://localhost:3000/api/export' -Method Post -ContentType 'application/json' -Body $pdfBody -OutFile 'perf-output.pdf';" ^
  "Write-Host 'Downloading first DOCX -> perf-output.docx...';" ^
  "Invoke-WebRequest -Uri 'http://localhost:3000/api/export' -Method Post -ContentType 'application/json' -Body $docxBody -OutFile 'perf-output.docx';" ^
  "Write-Host 'Running 100 timed PDF exports...';" ^
  "$totalSw = [System.Diagnostics.Stopwatch]::StartNew();" ^
  "$times = 1..100 | ForEach-Object { $ms = (Measure-Command { Invoke-RestMethod -Uri 'http://localhost:3000/api/export' -Method Post -ContentType 'application/json' -Body $pdfBody | Out-Null }).TotalMilliseconds; if ($_ %% 10 -eq 0) { Write-Host ('  Completed ' + $_ + '/100') }; $ms };" ^
  "$totalSw.Stop();" ^
  "$sorted = $times | Sort-Object;" ^
  "$stats = $sorted | Measure-Object -Average -Minimum -Maximum;" ^
  "[PSCustomObject]@{ Runs=$sorted.Count; MinMs=[math]::Round($stats.Minimum,1); AvgMs=[math]::Round($stats.Average,1); P95Ms=[math]::Round($sorted[[math]::Floor($sorted.Count*0.95)-1],1); MaxMs=[math]::Round($stats.Maximum,1); TotalSec=[math]::Round($totalSw.Elapsed.TotalSeconds,2) } | Format-Table -AutoSize"

echo.
echo === Container Resource Usage ===
docker stats docpad-perf --no-stream

endlocal
