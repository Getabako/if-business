#!/bin/bash

# GitHub Actions ワークフローセットアップスクリプト
# このスクリプトを実行すると、リポジトリのルートに.github/workflows/ディレクトリを作成し、
# ワークフローファイルをコピーします。

set -e

echo "🔧 GitHub Actions ワークフローをセットアップしています..."
echo ""

# スクリプトのディレクトリを取得
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# リポジトリのルートディレクトリを取得（WorkFlow_originの親ディレクトリ）
REPO_ROOT="$(dirname "$SCRIPT_DIR")"

# .githubディレクトリが存在するか確認
if [ ! -d "$REPO_ROOT/.git" ]; then
    echo "❌ エラー: このディレクトリはGitリポジトリではありません"
    echo "   リポジトリのルートで実行してください"
    exit 1
fi

# .github/workflowsディレクトリを作成
mkdir -p "$REPO_ROOT/.github/workflows"

# ワークフローファイルをコピー
if [ -f "$SCRIPT_DIR/.github-template/workflows/content-generation.yml" ]; then
    cp "$SCRIPT_DIR/.github-template/workflows/content-generation.yml" "$REPO_ROOT/.github/workflows/"
    echo "✅ ワークフローファイルをコピーしました"
    echo "   場所: .github/workflows/content-generation.yml"
else
    echo "❌ エラー: テンプレートファイルが見つかりません"
    exit 1
fi

echo ""
echo "✅ セットアップ完了！"
echo ""
echo "📋 次のステップ:"
echo "   1. GitHubリポジトリのSettings > Secrets and variables > Actions"
echo "   2. 'New repository secret' をクリック"
echo "   3. 名前: GEMINI_API_KEY"
echo "   4. 値: あなたのGemini APIキーを貼り付け"
echo ""
echo "   その後、以下のコマンドでコミット＆プッシュしてください:"
echo "   git add .github/workflows/content-generation.yml"
echo "   git commit -m 'Add GitHub Actions workflow for Instagram content generation'"
echo "   git push"
echo ""
echo "🎉 GitHub Actionsでワークフローが利用可能になります！"
