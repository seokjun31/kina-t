# Run in PowerShell: .\_commit_and_pr.ps1
Set-Location "D:\kina-t\.claude\worktrees\distracted-hugle"
git add src/App.jsx
git commit -m "feat: 파티분배 버튼·저장·추가탭 고정 4파티 개선

- 방생성 버튼 라벨을 '파티분배'로 변경 (참석 중일 때)
- 파티분배 모달에 '저장 완료' 버튼 추가 → 닫히면서 파티모집 창으로 복귀
- 추가모집 탭을 고정 4파티(1파티~4파티) 방식으로 변경, 최대 16명

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
git push origin claude/distracted-hugle
gh pr create --title "feat: 파티분배 버튼·저장·추가탭 고정 4파티 개선" --body "## Summary
- 방생성 버튼 → 파티분배 버튼으로 라벨 변경
- 파티분배 모달에 저장 완료 버튼 추가 (닫힘 후 파티모집 창 복귀)
- 추가모집 탭: 1파티/2파티/3파티/4파티 고정 운영, 최대 16명

🤖 Generated with [Claude Code](https://claude.com/claude-code)"
