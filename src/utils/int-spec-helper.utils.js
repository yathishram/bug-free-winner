const _ = require("lodash");
const omitDeep = require("omit-deep-lodash")


function assertErrStatus(
  expect,
  res,
  expectedStatus,
  expectedMessage,
  expectedError
) {
  const { status, body } = res;
  expect(status).toBe(expectedStatus);
  let message = body.message || body.error;
  if (!Array.isArray(message)) {
    message = [message];
  }
  if (expectedMessage.length > 0) {
    expect(message).toStrictEqual(expectedMessage);
  }
  if (expectedError) {
    expect(body.error).toEqual(expectedError);
  }
}

function assert200Body(expect, res, expectedBody, sortBy = "id", omit = []) {
  const { status, body } = res;
  if (!(status >= 200 && status < 300)) {
    console.error(body);
  }

  let receivedBody = body;
  if (!Array.isArray(body)) {
    receivedBody = [body];
  }
  const sortedReceivedBody = _.sortBy(receivedBody, sortBy);

  expect(sortedReceivedBody.length).toEqual(expectedBody.length);
  expect(sortedReceivedBody.map((b) => omitDeep(b, omit))).toStrictEqual(
    _.sortBy(omitDeep(expectedBody, omit), sortBy)
  );
}

function assert400Body(
  expect,
  returns,
  expectedBody,
  sortBy = "id",
  omit = []
) {
  const { status, body } = res;
  if (!(status >= 400 && status < 500)) {
    console.error(body);
  }

  let receivedBody = body;
  if (!Array.isArray(body)) {
    receivedBody = [body];
  }
  const sortedReceivedBody = _.sortBy(receivedBody, sortBy);
  expect(sortedReceivedBody.length).toEqual(expectedBody.length);
  expect(sortedReceivedBody.map((b) => omitDeep(b, omit))).toStrictEqual(
    _.sortBy(omitDeep(expectedBody, omit), sortBy)
  );
}

module.exports = {
  assertErrStatus,
  assert200Body,
  assert400Body,
};
