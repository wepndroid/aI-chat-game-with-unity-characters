import fsPromises from 'node:fs/promises'
import path from 'node:path'

const WEBGL_AUTH_TOKEN_MAX_CHARS = 4096

type WebglParentOriginEnvironment = {
  NODE_ENV?: string
  WEBGL_PARENT_ORIGINS?: string
  FRONTEND_URL?: string
  CORS_ORIGIN?: string
}

type WebglParentOriginOptions = {
  env?: WebglParentOriginEnvironment
  isProduction?: boolean
}

type EmbeddedWebglIndexOptions = {
  title: string
  loaderScriptPath: string
  unityConfigObjectLiteral: string
  allowedParentOrigins: string[]
}

const splitOriginList = (value: string | undefined) => {
  return value
    ?.split(',')
    .map((origin) => origin.trim())
    .filter((origin) => origin.length > 0) ?? []
}

const normalizeWebglParentOrigin = (value: string) => {
  const trimmed = value.trim().replace(/^['"]|['"]$/g, '')
  if (!trimmed || trimmed === '*') {
    return null
  }

  try {
    const parsed = new URL(trimmed)
    const hasPathSearchOrHash = parsed.pathname !== '/' || parsed.search.length > 0 || parsed.hash.length > 0

    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return null
    }
    if (parsed.username || parsed.password || hasPathSearchOrHash) {
      return null
    }

    return parsed.origin
  } catch {
    return null
  }
}

const parseConfiguredOrigins = (name: string, value: string | undefined) => {
  return splitOriginList(value).map((origin) => {
    const normalizedOrigin = normalizeWebglParentOrigin(origin)

    if (!normalizedOrigin) {
      throw new Error(`${name} contains an invalid WebGL parent origin: ${origin}`)
    }

    return normalizedOrigin
  })
}

const addOrigins = (target: Set<string>, origins: string[]) => {
  for (const origin of origins) {
    target.add(origin)
  }
}

const resolveWebglParentOrigins = (options: WebglParentOriginOptions = {}) => {
  const env = options.env ?? process.env
  const isProduction = options.isProduction ?? env.NODE_ENV === 'production'
  const dedicatedOrigins = parseConfiguredOrigins('WEBGL_PARENT_ORIGINS', env.WEBGL_PARENT_ORIGINS)
  const origins = new Set<string>()

  addOrigins(origins, dedicatedOrigins)

  if (origins.size === 0 && env.FRONTEND_URL?.trim()) {
    addOrigins(origins, parseConfiguredOrigins('FRONTEND_URL', env.FRONTEND_URL))
  }

  if (dedicatedOrigins.length === 0 && !isProduction) {
    addOrigins(origins, parseConfiguredOrigins('CORS_ORIGIN', env.CORS_ORIGIN))
  }

  if (isProduction && origins.size === 0) {
    throw new Error('WEBGL_PARENT_ORIGINS must be configured for production WebGL releases.')
  }

  return Array.from(origins)
}

const extractHtmlTitle = (html: string) => {
  const match = html.match(/<title>([\s\S]*?)<\/title>/i)
  return match?.[1]?.trim() || 'Unity Web Player'
}

const extractLoaderScriptPath = (html: string) => {
  const match = html.match(/<script\s+src="([^"]+\.loader\.js)"/i)
  if (!match?.[1]) {
    throw new Error('The WebGL index.html must reference a Unity loader script.')
  }

  return match[1].trim()
}

const extractUnityConfigObjectLiteral = (html: string) => {
  const createUnityInstanceIndex = html.indexOf('createUnityInstance(')
  if (createUnityInstanceIndex === -1) {
    throw new Error('The WebGL index.html must call createUnityInstance(...).')
  }

  const firstBraceIndex = html.indexOf('{', createUnityInstanceIndex)
  if (firstBraceIndex === -1) {
    throw new Error('Unable to read the Unity configuration from index.html.')
  }

  let depth = 0
  let inSingleQuote = false
  let inDoubleQuote = false
  let inTemplateString = false
  let isEscaped = false

  for (let index = firstBraceIndex; index < html.length; index += 1) {
    const character = html[index]

    if (isEscaped) {
      isEscaped = false
      continue
    }

    if (character === '\\') {
      isEscaped = true
      continue
    }

    if (!inDoubleQuote && !inTemplateString && character === '\'') {
      inSingleQuote = !inSingleQuote
      continue
    }

    if (!inSingleQuote && !inTemplateString && character === '"') {
      inDoubleQuote = !inDoubleQuote
      continue
    }

    if (!inSingleQuote && !inDoubleQuote && character === '`') {
      inTemplateString = !inTemplateString
      continue
    }

    if (inSingleQuote || inDoubleQuote || inTemplateString) {
      continue
    }

    if (character === '{') {
      depth += 1
      continue
    }

    if (character === '}') {
      depth -= 1
      if (depth === 0) {
        return html.slice(firstBraceIndex, index + 1)
      }
    }
  }

  throw new Error('Unable to find the end of the Unity configuration in index.html.')
}

const escapeHtml = (value: string) =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')

const buildEmbeddedWebglIndexHtml = (options: EmbeddedWebglIndexOptions) => {
  const allowedParentOriginsJson = JSON.stringify(options.allowedParentOrigins)

  return `<!DOCTYPE html>
<html lang="en-us">
  <head>
    <meta charset="utf-8">
    <meta http-equiv="Content-Type" content="text/html; charset=utf-8">
    <title>${escapeHtml(options.title)}</title>
    <style>
      html,
      body {
        margin: 0;
        padding: 0;
        width: 100%;
        height: 100%;
        overflow: hidden;
        background: #231f20;
      }

      #unity-canvas {
        display: block;
        width: 100%;
        height: 100%;
        background: #231f20;
      }
    </style>
  </head>
  <body>
    <canvas id="unity-canvas" tabindex="-1"></canvas>
    <script src=${JSON.stringify(options.loaderScriptPath)}></script>
    <script>
      var canvas = document.querySelector("#unity-canvas");
      var allowedParentOrigins = ${allowedParentOriginsJson};
      var webglAuthTokenMaxChars = ${WEBGL_AUTH_TOKEN_MAX_CHARS};

      function isAllowedParentOrigin(origin) {
        return typeof origin === "string" && allowedParentOrigins.indexOf(origin) !== -1;
      }

      function isFutureTimestamp(value) {
        if (typeof value !== "string" || value.length === 0) {
          return false;
        }

        var timestamp = Date.parse(value);
        return Number.isFinite(timestamp) && timestamp > Date.now();
      }

      function postToParent(type, payload) {
        if (!window.parent || window.parent === window || allowedParentOrigins.length === 0) {
          return;
        }

        for (var index = 0; index < allowedParentOrigins.length; index += 1) {
          var parentOrigin = allowedParentOrigins[index];
          try {
            window.parent.postMessage(
              Object.assign(
                {
                  type: "secretwaifu-webgl:" + type
                },
                payload || {}
              ),
              parentOrigin
            );
          } catch (error) {
            console.warn("Unable to post WebGL bridge message to parent window.");
          }
        }
      }

      window.SecretWaifuWebglBridge = {
        postAuthSessionReady: function (expiresAt) {
          if (typeof expiresAt !== "string" || expiresAt.length === 0) {
            return;
          }

          postToParent("auth-session-ready", { expiresAt: expiresAt });
        }
      };

      function createFallbackPermissionStatus(state) {
        return {
          state: state || "prompt",
          onchange: null,
          addEventListener: function () {},
          removeEventListener: function () {},
          dispatchEvent: function () {
            return false;
          }
        };
      }

      function normalizePermissionStatus(status) {
        if (!status || typeof status !== "object") {
          return createFallbackPermissionStatus("prompt");
        }

        if (typeof status.addEventListener !== "function") {
          status.addEventListener = function () {};
        }
        if (typeof status.removeEventListener !== "function") {
          status.removeEventListener = function () {};
        }
        if (typeof status.dispatchEvent !== "function") {
          status.dispatchEvent = function () {
            return false;
          };
        }
        if (!("onchange" in status)) {
          status.onchange = null;
        }
        if (!status.state || typeof status.state !== "string") {
          status.state = "prompt";
        }

        return status;
      }

      if (navigator.permissions && typeof navigator.permissions.query === "function") {
        var originalPermissionsQuery = navigator.permissions.query.bind(navigator.permissions);
        navigator.permissions.query = function(permissionDescriptor) {
          try {
            return originalPermissionsQuery(permissionDescriptor)
              .then(function(status) {
                return normalizePermissionStatus(status);
              })
              .catch(function(error) {
                console.warn("Permissions query failed, using fallback state.", error);
                return createFallbackPermissionStatus("prompt");
              });
          } catch (error) {
            console.warn("Permissions query threw, using fallback state.", error);
            return Promise.resolve(createFallbackPermissionStatus("prompt"));
          }
        };
      }

      if (/iPhone|iPad|iPod|Android/i.test(navigator.userAgent)) {
        var meta = document.createElement("meta");
        meta.name = "viewport";
        meta.content = "width=device-width, height=device-height, initial-scale=1.0, user-scalable=no, shrink-to-fit=yes";
        document.getElementsByTagName("head")[0].appendChild(meta);

        canvas.style.width = "100%";
        canvas.style.height = "100%";
      }

      createUnityInstance(
        canvas,
        ${options.unityConfigObjectLiteral},
        function(progress) {
          postToParent("progress", { progress: progress });
        }
      ).then((unityInstance) => {
        window.addEventListener("message", function (event) {
          var data = event.data;
          if (event.source !== window.parent || !isAllowedParentOrigin(event.origin)) {
            return;
          }
          if (!data || typeof data !== "object" || Array.isArray(data)) {
            return;
          }
          var receiverMethod = null;
          var receiverPayload = null;
          if (data.type === "secretwaifu-auth:api-token") {
            receiverMethod = "ReceiveWebGlApiToken";
          } else if (data.type === "secretwaifu-auth:api-token-refresh") {
            receiverMethod = "ReceiveWebGlApiRefreshToken";
          } else if (data.type === "secretwaifu-webgl:launch-token") {
            receiverMethod = "ReceiveWebGlLaunchToken";
          } else {
            return;
          }

          var token = data.token;
          if (typeof token !== "string" || token.length === 0 || token.length > webglAuthTokenMaxChars) {
            return;
          }
          if (!isFutureTimestamp(data.expiresAt)) {
            return;
          }
          if (
            (data.type === "secretwaifu-auth:api-token" || data.type === "secretwaifu-auth:api-token-refresh") &&
            data.tokenType !== "Bearer"
          ) {
            return;
          }

          receiverPayload = token;
          if (data.type === "secretwaifu-auth:api-token" || data.type === "secretwaifu-auth:api-token-refresh") {
            receiverPayload = JSON.stringify({
              token: token,
              expiresAt: data.expiresAt
            });
          }

          try {
            unityInstance.SendMessage("AuthManager", receiverMethod, receiverPayload);
          } catch (sendError) {
            console.warn("AuthManager." + receiverMethod + " SendMessage failed.", sendError);
          }
        });

        postToParent("ready", { progress: 1 });
      }).catch(() => {
        postToParent("error", {
          code: "unity-loader-error",
          message: "The browser game failed to load. Please refresh the page and try again."
        });
      });
    </script>
  </body>
</html>
`
}

const instrumentExtractedWebglIndex = async (targetAbsoluteRoot: string, allowedParentOrigins = resolveWebglParentOrigins()) => {
  const indexHtmlPath = path.join(targetAbsoluteRoot, 'index.html')
  const sourceHtml = await fsPromises.readFile(indexHtmlPath, 'utf8')
  const title = extractHtmlTitle(sourceHtml)
  const loaderScriptPath = extractLoaderScriptPath(sourceHtml)
  const unityConfigObjectLiteral = extractUnityConfigObjectLiteral(sourceHtml)
  const embeddedHtml = buildEmbeddedWebglIndexHtml({
    title,
    loaderScriptPath,
    unityConfigObjectLiteral,
    allowedParentOrigins
  })

  await fsPromises.writeFile(indexHtmlPath, embeddedHtml, 'utf8')
}

export {
  WEBGL_AUTH_TOKEN_MAX_CHARS,
  buildEmbeddedWebglIndexHtml,
  extractHtmlTitle,
  extractLoaderScriptPath,
  extractUnityConfigObjectLiteral,
  instrumentExtractedWebglIndex,
  normalizeWebglParentOrigin,
  resolveWebglParentOrigins
}
export type { EmbeddedWebglIndexOptions, WebglParentOriginEnvironment }
