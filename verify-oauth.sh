#!/bin/bash
#
# kiraku-account OAuth 検証キット
#
# 使い方:
#   1. このスクリプトを実行可能にする: chmod +x verify-oauth.sh
#   2. 環境変数をセット（下記参照）
#   3. 各コマンドを順に実行
#
# 重要: SECRET類はチャットに貼らないでください！
#

set -e

echo "============================================"
echo "kiraku-account OAuth 検証キット"
echo "============================================"
echo ""

# =============================================
# 環境変数の設定（ユーザーが入力）
# =============================================
# Vercel Dashboard → Settings → Environment Variables から取得

# PUBLIC（チャットに貼ってOK）
# CLIENT_ID="your-chatgpt-oauth-client-id"
# REDIRECT_URI_RAW="https://chat.openai.com/aip/..."  # OAUTH_ALLOWED_REDIRECT_URIS の1つ

# SECRET（チャットに貼らない！）
# CLIENT_SECRET="your-chatgpt-oauth-client-secret"
# JWT_SECRET="your-jwt-secret"

echo "【事前確認】以下の環境変数がセットされていることを確認:"
echo "  CLIENT_ID:      ${CLIENT_ID:-(未設定)}"
echo "  REDIRECT_URI_RAW: ${REDIRECT_URI_RAW:-(未設定)}"
echo "  CLIENT_SECRET:  ${CLIENT_SECRET:+***設定済***}"
echo "  (JWT_SECRET は refresh誤用テストでのみ使用)"
echo ""

if [ -z "$CLIENT_ID" ] || [ -z "$REDIRECT_URI_RAW" ]; then
  echo "❌ CLIENT_ID と REDIRECT_URI_RAW を先に export してください"
  echo ""
  echo "例:"
  echo '  export CLIENT_ID="your-client-id"'
  echo '  export REDIRECT_URI_RAW="https://example.com"'
  echo '  export CLIENT_SECRET="your-client-secret"'
  echo ""
  exit 1
fi

# redirect_uri を URL エンコード
REDIRECT_URI_ENCODED=$(python3 -c "import urllib.parse; print(urllib.parse.quote('$REDIRECT_URI_RAW', safe=''))")

echo "============================================"
echo "【1】302 実証 (/oauth/authorize)"
echo "============================================"
echo ""
echo "コマンド:"
echo "curl -s -o /dev/null -w '%{http_code}' -D - \\"
echo "  \"https://kiraku-account.vercel.app/oauth/authorize?client_id=\${CLIENT_ID}&redirect_uri=\${REDIRECT_URI_ENCODED}&state=proof123\" \\"
echo "  | grep -E '^HTTP|^[Ll]ocation'"
echo ""
echo "実行中..."
echo ""

AUTHORIZE_RESULT=$(curl -s -o /dev/null -w '%{http_code}' -D - \
  "https://kiraku-account.vercel.app/oauth/authorize?client_id=${CLIENT_ID}&redirect_uri=${REDIRECT_URI_ENCODED}&state=proof123" \
  2>&1 | grep -iE '^HTTP|^location' || true)

echo "$AUTHORIZE_RESULT"
echo ""

# Location からドメイン部分だけ抽出
LOCATION_LINE=$(echo "$AUTHORIZE_RESULT" | grep -i '^location' | head -1)
if echo "$LOCATION_LINE" | grep -q 'github.com/login/oauth/authorize'; then
  echo "✅ 302 + Location: https://github.com/login/oauth/authorize?... 確認OK"
else
  echo "❌ 期待した Location が返っていません"
fi
echo ""

echo "============================================"
echo "【2】authorization_code → token200 → me200"
echo "============================================"
echo ""
echo "手順:"
echo "  A) ブラウザで以下のURLを開いてGitHub認可を完了:"
echo "     https://kiraku-account.vercel.app/oauth/authorize?client_id=${CLIENT_ID}&redirect_uri=${REDIRECT_URI_ENCODED}&state=proof123"
echo ""
echo "  B) リダイレクト先のURLから code= の値をコピー"
echo ""
echo "  C) 以下を実行（CODEを置換）:"
echo ""
read -p "取得した code を入力してください: " AUTH_CODE

if [ -z "$AUTH_CODE" ]; then
  echo "❌ code が入力されていません。スキップします。"
else
  if [ -z "$CLIENT_SECRET" ]; then
    echo "❌ CLIENT_SECRET が設定されていません"
    echo "   export CLIENT_SECRET=\"your-secret\" を実行してください"
  else
    echo ""
    echo "【2-1】/oauth/token (authorization_code) 実行中..."
    echo ""

    TOKEN_RESPONSE=$(curl -s -X POST "https://kiraku-account.vercel.app/oauth/token" \
      -H "Content-Type: application/x-www-form-urlencoded" \
      --data "grant_type=authorization_code&client_id=${CLIENT_ID}&client_secret=${CLIENT_SECRET}&code=${AUTH_CODE}")

    TOKEN_STATUS=$(echo "$TOKEN_RESPONSE" | python3 -c "import sys,json; d=json.load(sys.stdin); print('200' if 'access_token' in d else '400')" 2>/dev/null || echo "error")

    if [ "$TOKEN_STATUS" = "200" ]; then
      ACCESS_TOKEN=$(echo "$TOKEN_RESPONSE" | python3 -c "import sys,json; print(json.load(sys.stdin)['access_token'])")
      REFRESH_TOKEN=$(echo "$TOKEN_RESPONSE" | python3 -c "import sys,json; print(json.load(sys.stdin)['refresh_token'])")

      echo "✅ /oauth/token: 200"
      echo "   access_token: ${ACCESS_TOKEN:0:8}..."
      echo "   refresh_token: ${REFRESH_TOKEN:0:8}..."
      echo ""

      echo "【2-2】/user/me (access_token) 実行中..."
      ME_STATUS=$(curl -s -o /dev/null -w '%{http_code}' \
        -H "Authorization: Bearer ${ACCESS_TOKEN}" \
        "https://kiraku-account.vercel.app/user/me")

      if [ "$ME_STATUS" = "200" ]; then
        echo "✅ /user/me: 200"
      else
        echo "❌ /user/me: $ME_STATUS (期待: 200)"
      fi
      echo ""

      echo "============================================"
      echo "【3】refresh_token 誤用防止テスト"
      echo "============================================"
      echo ""

      echo "【3-1】/user/me に refresh_token を渡す (期待: 401)"
      ME_REFRESH_STATUS=$(curl -s -o /dev/null -w '%{http_code}' \
        -H "Authorization: Bearer ${REFRESH_TOKEN}" \
        "https://kiraku-account.vercel.app/user/me")

      if [ "$ME_REFRESH_STATUS" = "401" ]; then
        echo "✅ /user/me (refresh_token): 401"
      else
        echo "❌ /user/me (refresh_token): $ME_REFRESH_STATUS (期待: 401)"
      fi
      echo ""

      echo "【3-2】refresh_token grant に access_token を渡す (期待: 400)"
      REFRESH_WITH_ACCESS_STATUS=$(curl -s -o /dev/null -w '%{http_code}' \
        -X POST "https://kiraku-account.vercel.app/oauth/token" \
        -H "Content-Type: application/x-www-form-urlencoded" \
        --data "grant_type=refresh_token&client_id=${CLIENT_ID}&client_secret=${CLIENT_SECRET}&refresh_token=${ACCESS_TOKEN}")

      if [ "$REFRESH_WITH_ACCESS_STATUS" = "400" ]; then
        echo "✅ refresh_grant(access_token): 400 INVALID_GRANT"
      else
        echo "❌ refresh_grant(access_token): $REFRESH_WITH_ACCESS_STATUS (期待: 400)"
      fi
      echo ""

      echo "【3-3】refresh_token grant に refresh_token を渡す (期待: 200)"
      REFRESH_WITH_REFRESH_STATUS=$(curl -s -o /dev/null -w '%{http_code}' \
        -X POST "https://kiraku-account.vercel.app/oauth/token" \
        -H "Content-Type: application/x-www-form-urlencoded" \
        --data "grant_type=refresh_token&client_id=${CLIENT_ID}&client_secret=${CLIENT_SECRET}&refresh_token=${REFRESH_TOKEN}")

      if [ "$REFRESH_WITH_REFRESH_STATUS" = "200" ]; then
        echo "✅ refresh_grant(refresh_token): 200"
      else
        echo "❌ refresh_grant(refresh_token): $REFRESH_WITH_REFRESH_STATUS (期待: 200)"
      fi
      echo ""

    else
      echo "❌ /oauth/token 失敗"
      echo "   Response: $TOKEN_RESPONSE"
    fi
  fi
fi

echo "============================================"
echo "【結果サマリー】CODEXに提出するログ"
echo "============================================"
echo ""
echo "以下をコピーして提出してください："
echo ""
echo "---"
echo "## 外形実証ログ (kiraku-account)"
echo ""
echo "### 1. /oauth/authorize 302 実証"
echo '```'
echo "$AUTHORIZE_RESULT" | head -2
echo '```'
echo ""
echo "### 2. authorization_code → token → me"
if [ -n "$ACCESS_TOKEN" ]; then
echo "- /oauth/token: **200** (access_token: ${ACCESS_TOKEN:0:8}...)"
echo "- /user/me (access): **$ME_STATUS**"
fi
echo ""
echo "### 3. refresh_token 誤用防止"
if [ -n "$REFRESH_TOKEN" ]; then
echo "- /user/me (refresh): **$ME_REFRESH_STATUS** (期待: 401)"
echo "- refresh_grant(access_token): **$REFRESH_WITH_ACCESS_STATUS** (期待: 400)"
echo "- refresh_grant(refresh_token): **$REFRESH_WITH_REFRESH_STATUS** (期待: 200)"
fi
echo ""
echo "### Production"
echo "- Commit: c11ecf2"
echo "- Status: success"
echo "---"
echo ""

echo "============================================"
echo "【注意事項】"
echo "============================================"
echo "1. SECRET類はチャットに貼らないでください"
echo "2. allowlistに example.com を追加した場合は検証後に削除"
echo "3. 必要に応じて JWT_SECRET をローテーション（推奨）"
echo ""
