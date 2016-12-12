'use strict';

const Promise = require('bluebird');
const path = require('path');
const fs = Promise.promisifyAll(require('fs-extra'));

const CODE_TEMPLATE = require('./lib/wrapped_handler.js');

const SAVED_HANDLER_SUFFIX = '__orig__';


module.exports = function getPlugin(S) {
  const SCli = require(S.getServerlessPath('utils/cli'));

  class ServerlessWrappper extends S.classes.Plugin {
    static getName() {
      return `com.serverless.${ServerlessWrappper.name}`;
    }

    registerHooks() {
      S.addHook(this.onCodeDeployPre.bind(this), {
        action: 'codeDeployLambda',
        event: 'pre'
      });

      S.addHook(this.onCodeDeployPost.bind(this), {
        action: 'codeDeployLambda',
        event: 'post'
      });

      return Promise.resolve();
    }

    // Pre event
    // ------------------------------------------------------------------------

    /**
     * Intercept the codeDeployLammbda hook and wrap the serverless handler
     * function in the configured wrapper function.
     */
    onCodeDeployPre(evt) {
      // Validate: Check Serverless version
      if (parseInt(S._version.split('.')[1], 10) < 5) {
        SCli.log('WARNING: This version of the Serverless Wrapper Plugin ' +
          'will not work with a version of Serverless that is less or greater than than v0.5.x');
      }

      // Get function
      const project = S.getProject();
      const func = project.getFunction(evt.options.name);

      if (func.runtime === 'nodejs' || func.runtime === 'nodejs4.3') {
        const projectPath = S.config.projectPath;
        const config = project.custom.wrapper;

        if (config && config.path) {
          const pathSource = path.dirname(func.getFilePath());
          const pathDist = evt.options.pathDist;

          // Get the name of the handler function (within the handler module)
          const handler = func.handler;
          const handlerFunction = handler.split('.').shift();

          // Information about the serverless framework version of the handler
          // [NOTE: the version in the package directory (pathDist)]
          const serverlessHandlerPath = this._getServerlessHandlerPath(func, pathDist);

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
          const relativeWrapperPath =
            path.relative(pathSource, path.join(rootPath, config.path));


          // 1. Move the original serverless framework handler to savedHandlerPath
          // [NOTE: force this write if necessary]
          return fs.moveAsync(serverlessHandlerPath, savedHandlerPath, { clobber: true })
            .then(() => {
              // 2. Generate wrapped handler code
              return CODE_TEMPLATE({
                orig_handler_path: `./${savedHandlerFilename}`,
                wrapper_path: relativeWrapperPath,
                handler_name: handlerFunction,
              });
            })
            .then(code => {
              // 3. Write code to wrapped handler
              return fs.writeFile(wrappedServerlessHandlerPath, code)
            })
            .then(() => {
              // 4. Resolve the event
              SCli.log(`Wrapping ${handler} with ${relativeWrapperPath}`);
              return evt;
            });
        }
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
    onCodeDeployPost(evt) {
      // Get function
      const project = S.getProject();
      const func = project.getFunction(evt.options.name);

      if (func.runtime === 'nodejs' || func.runtime === 'nodejs4.3') {
        const config = project.custom.wrapper;

        if (config && config.path) {
          const pathSource = path.dirname(func.getFilePath());
          const savedHandlerPath = this._getSavedHandlerPath(func, pathSource);

          // 1. Remove the saved version
          return fs.unlinkAsync(savedHandlerPath)
            .then(() => {
              // 2. Resolve the event
              return evt;
            });
        }
      }

      // If we can't handle this event, just pass it through
      return Promise.resolve(evt);
    }

    // Helpers
    // ------------------------------------------------------------------------

    // Information about the serverless framework version of the handler
    _getServerlessHandlerPath(func, targetDir) {
      const serverlessHandler = func.getHandler();
      const serverlessHandlerName = serverlessHandler.split('.')[0];
      const serverlessHandlerFilename = `${serverlessHandlerName}.js`;

      return path.join(targetDir, serverlessHandlerFilename);
    }

    // Information about the serverless framework version of the handler
    _getSavedHandlerFilename(func) {
        const serverlessHandler = func.getHandler();
        const serverlessHandlerName = serverlessHandler.split('.')[0];

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

