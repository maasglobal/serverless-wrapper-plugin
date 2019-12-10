"use strict";

const path = require("path");
const fs = require("fs-extra");

const codeTemplate = require("./lib/wrapped_handler.js");

const SAVED_HANDLER_SUFFIX = "__orig__";

module.exports = function getPlugin(S) {
  const SCli = require(S.getServerlessPath("utils/cli"));

  class ServerlessWrappper extends S.classes.Plugin {
    static getName() {
      return `com.serverless.${ServerlessWrappper.name}`;
    }

    registerHooks() {
      S.addHook(this.preAction.bind(this), {
        action: "codeDeployLambda",
        event: "pre"
      });

      S.addHook(this.postAction.bind(this), {
        action: "codeDeployLambda",
        event: "post"
      });

      S.addHook(this.preAction.bind(this), {
        action: "functionRun",
        event: "pre"
      });

      S.addHook(this.postAction.bind(this), {
        action: "functionRun",
        event: "post"
      });

      return Promise.resolve();
    }

    // Pre event
    // ------------------------------------------------------------------------

    /**
     * Intercept the codeDeployLammbda hook and wrap the serverless handler
     * function in the configured wrapper function.
     */
    preAction(evt) {
      // Validate: Check Serverless version
      if (parseInt(S._version.split(".")[1], 10) < 5) {
        SCli.log(
          "WARNING: This version of the Serverless Wrapper Plugin " +
            "will not work with a version of Serverless that is less or greater than than v0.5.x"
        );
      }

      // Get function
      const project = S.getProject();
      const func = project.getFunction(evt.options.name);

      const funcConfig = func.custom;
      const projConfig = project.custom;

      if (funcConfig && funcConfig.wrapper === false) {
        // If wrapper.path exists and is 'false', skip wrapping
        return Promise.resolve(evt);
      } else if (funcConfig && funcConfig.wrapper && funcConfig.wrapper.path) {
        return this._wrapHandler(project, func, evt, funcConfig.wrapper.path);
      } else if (projConfig && projConfig.wrapper && projConfig.wrapper.path) {
        return this._wrapHandler(project, func, evt, projConfig.wrapper.path);
      }

      // If we can't handle this event, just pass it through
      return Promise.resolve(evt);
    }

    // Post event
    // ------------------------------------------------------------------------

    /**
     * Once the codeDeployLambda operation has completed,
     * clean up any intermediate files
     */
    postAction(evt) {
      // Get function
      const project = S.getProject();
      const func = project.getFunction(evt.options.name);

      const funcConfig = func.custom;
      const projConfig = project.custom;

      // No wrapper due to function config override, skip cleanup
      if (funcConfig && funcConfig.wrapper === false) {
        return Promise.resolve(evt);
      }
      // If we do have a wrapper, we need to clean up intermediate files
      else if (
        (funcConfig && funcConfig.wrapper && funcConfig.wrapper.path) ||
        (projConfig && projConfig.wrapper && projConfig.wrapper.path)
      ) {
        const pathSource = path.dirname(func.getFilePath());
        const isLocalRun = !evt.options.pathDist;
        const savedHandlerPath = this._getSavedHandlerPath(func, pathSource);

        const action = isLocalRun
          ? fs.move(
              savedHandlerPath,
              this._getServerlessHandlerPath(func.handler, pathSource),
              { overwrite: true }
            )
          : fs.remove(savedHandlerPath);

        return action.then(() => evt);
      }

      // If we can't handle this event, just pass it through
      return Promise.resolve(evt);
    }

    // Helpers
    // ------------------------------------------------------------------------

    _wrapHandler(project, func, evt, wrapperPath) {
      const pathSource = path.dirname(func.getFilePath());
      const pathDist = evt.options.pathDist;
      const isLocalRun = !pathDist;

      // Get the name of the handler function (within the handler module)
      const handler = func.handler;
      const handlerFunction = handler.split(".").pop();

      // Information about the serverless framework version of the handler
      // [NOTE: the version in the package directory (pathDist)]
      const serverlessHandlerPath = this._getServerlessHandlerPath(
        isLocalRun ? handler : func.getHandler(),
        isLocalRun ? pathSource : pathDist
      );

      // The new wrapped handler.
      // This will take the place of the original serverless framework handler
      const wrappedServerlessHandlerPath = serverlessHandlerPath;

      // We will save the original serverless framework handler
      // so that it can be included by the wrapped handler
      // [NOTE: temporarily saved in the source directory]
      const savedHandlerFilename = this._getSavedHandlerFilename(func);
      const savedHandlerPath = this._getSavedHandlerPath(func, pathSource);

      // Relative path to the wrapper function, from the serverless handler function
      const rootPath = project.getRootPath();
      const relativeWrapperPath = path.relative(
        pathSource,
        path.join(rootPath, wrapperPath)
      );
      const absolutePath = path.join(pathSource, relativeWrapperPath);

      // 0. Check if file exist in path
      return fs.pathExists(savedHandlerPath).then(tmpHandlerExists => {
        if (isLocalRun && tmpHandlerExists) {
          throw new Error(
            `Cannot wrap lambda: Temporary wrapper file found at ${savedHandlerPath}\n` +
              "It's likely that previous run crashed, and left broken state.\n" +
              "If it's the case, then replacing lambda handler file with content of " +
              `${savedHandlerFilename}, and removing the ${savedHandlerFilename} should fix the issue.`
          );
        }
        return fs
          .move(serverlessHandlerPath, savedHandlerPath, { overwrite: true })
          .then(() => {
            // 2. Generate wrapped handler code
            return codeTemplate({
              orig_handler_path: `./${savedHandlerFilename}`,
              wrapper_path: relativeWrapperPath.replace(/\\/g, "/"), // Support Windows env
              handler_name: handlerFunction
            });
          })
          .then(code => {
            // 3. Write code to wrapped handler
            return fs.outputFile(wrappedServerlessHandlerPath, code);
          })
          .then(() => {
            // 4. Resolve the event
            return evt;
          });
      });
    }

    // Information about the serverless framework version of the handler
    _getServerlessHandlerPath(serverlessHandler, targetDir) {
      const serverlessHandlerName = serverlessHandler.split(".")[0];
      const serverlessHandlerFilename = `${serverlessHandlerName}.js`;

      return path.join(targetDir, serverlessHandlerFilename);
    }

    // Information about the serverless framework version of the handler
    _getSavedHandlerFilename(func) {
      const serverlessHandler = func.getHandler();
      const serverlessHandlerName = serverlessHandler.split(".")[0];

      // Information about the saved version of the original serverless handler
      return `${serverlessHandlerName}${SAVED_HANDLER_SUFFIX}.js`;
    }

    // Information about the intermediary saved version of the serverless handler
    _getSavedHandlerPath(func, targetDir) {
      const savedHandlerFilename = this._getSavedHandlerFilename(func);

      return path.join(targetDir, savedHandlerFilename);
    }
  }

  return ServerlessWrappper;
};
