//no need to repeat try catch again and again

const asyncHandler = (requestHandler) => {
  return (req, res, next) => {
    Promise.resolve(requestHandler(req, res, next)).catch((err) => {
      next(err);
    });
  };
};

export { asyncHandler };

//requestHandler --my controller
//promise - used for values which are not available immediately but will be available in future contains 3 states 1 pending 2 fullfilled reslove 3 rejected async await is made on promise
