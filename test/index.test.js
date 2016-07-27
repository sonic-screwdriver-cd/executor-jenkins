'use strict';
/* eslint-disable no-console*/
const assert = require('chai').assert;
const sinon = require('sinon');
const mockery = require('mockery');

sinon.assert.expose(assert, { prefix: '' });

const TEST_TIM_YAML = `
metadata:
  name: {{build_id}}
  job: {{job_id}}
  pipeline: {{pipeline_id}}
command:
- "/opt/screwdriver/launch {{git_org}} {{git_repo}} {{git_branch}} {{job_name}}"
`;

/**
 * Stub for Readable wrapper
 * @method ReadableMock
 */
function ReadableMock() {}
/**
 * Stub for circuit-fuses wrapper
 * @method BreakerMock
 */
function BreakerMock() {}

describe('index', () => {
    let Executor;
    let requestMock;
    let fsMock;
    let executor;
    let readableMock;
    let breakRunMock;
//    let getCrumbMock;
    const testScmUrl = 'git@github.com:screwdriver-cd/hashr.git';
    const testBuildId = 'build_ad11234tag41fda';
    const testJobId = 'job_ad11234tag41fda';
    const testPipelineId = 'pipeline_ad11234tag41fda';
    const fakeResponse = {
        statusCode: 201,
        body: {
            success: true
        }
    };
    const fakeCrumb = {
        statusCode: 200,
        body: {
            _class: 'hudson.security.csrf.DefaultCrumbIssuer',
            crumb: '24e80888069a1beaa5af3e0e3ef201d0',
            crumbRequestField: 'Jenkins-Crumb'
        }
    };
    const crumbUrl = 'https://jenkins:8080/crumbIssuer/api/json';
    const jobsUrl = 'https://jenkins/apis/batch/v1/namespaces/default/jobs';
    const podsUrl = 'https://jenkins/api/v1/namespaces/default/pods';

    before(() => {
        mockery.enable({
            useCleanCache: true,
            warnOnUnregistered: false
        });
    });

    beforeEach(() => {
        requestMock = {
            post: sinon.stub(),
            get: sinon.stub()
        };

        fsMock = {
            readFileSync: sinon.stub()
        };

        readableMock = {
            wrap: sinon.stub()
        };

        breakRunMock = sinon.stub();

        BreakerMock.prototype.runCommand = breakRunMock;
        ReadableMock.prototype.wrap = readableMock.wrap;

        fsMock.readFileSync.withArgs('/etc/jenkins/apikey/token').returns('api_key');
        fsMock.readFileSync.withArgs(sinon.match(/config\/job.yaml.tim/))
        .returns(TEST_TIM_YAML);

        mockery.registerMock('stream', {
            Readable: ReadableMock
        });
        mockery.registerMock('fs', fsMock);
        mockery.registerMock('request', requestMock);
        mockery.registerMock('circuit-fuses', BreakerMock);

        /* eslint-disable global-require */
        Executor = require('../index');
        /* eslint-enable global-require */

        executor = new Executor({
            token: 'api_key',
            host: 'jenkins'
        });
    });

    afterEach(() => {
        mockery.deregisterAll();
        mockery.resetCache();
    });

    after(() => {
        mockery.disable();
    });

    it('extends base class', () => {
        assert.isFunction(executor.stop);
        assert.isFunction(executor.start);
        assert.isFunction(executor.getCrumb);
    });

    describe('getCrumb', () => {
        beforeEach(() => {
            breakRunMock.yieldsAsync(null, fakeCrumb);
        });

        it('with correct uri', (done) => {
            const crumbConfig = {
                uri: crumbUrl,
                method: 'GET'
            };

            executor.getCrumb({
                host: 'jenkins'
            }, (err) => {
                assert.isNull(err);
                assert.calledOnce(breakRunMock);
                assert.calledWith(breakRunMock, crumbConfig);
                done();
            });
        });

        it('with incorrect uri', (done) => {
            const error = new Error('T_T');

            breakRunMock.yieldsAsync(error);

            executor.getCrumb({
                host: 'jenkins'
            }, (err) => {
                assert.deepEqual(err, error);
                done();
            });
        });
    });

    // describe('createJob', () => {
    //     beforeEach(() => {
    //         breakRunMock.yieldsAsync(null, fakeResponse, fakeResponse.body);
    //         // getCrumbMock = sinon.stub();
    //         // mockery.registerMock('getCrumb', getCrumbMock);
    //     });
    //
    //     it('create a job successful', (done) => {
    //         // getCrumbMock.yieldsAsync(null, fakeCrumb);
    //         const postConfig = {
    //             uri: jobsUrl,
    //             method: 'POST',
    //             json: {
    //                 metadata: {
    //                     name: testBuildId,
    //                     job: testJobId,
    //                     pipeline: testPipelineId
    //                 },
    //                 command: ['/opt/screwdriver/launch screwdriver-cd hashr addSD main']
    //             },
    //             headers: {
    //                 'Content-Type': 'application/xml',
    //                 [fakeCrumb.crumbRequestField]: fakeCrumb.crumb
    //             }
    //         };
    //
    //         executor.createJob({
    //             host: 'jenkins',
    //             name: 'sampleMilano',
    //             scmUrl: 'git@github.com:screwdriver-cd/hashr.git#addSD',
    //             secretToken: 'secretToken'
    //         }, (err) => {
    //             assert.isNull(err);
    //             assert.calledOnce(breakRunMock);
    //             assert.calledWith(breakRunMock, postConfig);
    //             done();
    //         });
    //     });
    // });

    describe('start', () => {
        beforeEach(() => {
            breakRunMock.yieldsAsync(null, fakeResponse, fakeResponse.body);
        });

        describe('successful requests', () => {
            it('with scmUrl containing branch', (done) => {
                const postConfig = {
                    uri: jobsUrl,
                    method: 'POST',
                    json: {
                        metadata: {
                            name: testBuildId,
                            job: testJobId,
                            pipeline: testPipelineId
                        },
                        command: ['/opt/screwdriver/launch screwdriver-cd hashr addSD main']
                    },
                    headers: {
                        Authorization: 'Bearer api_key'
                    },
                    strictSSL: false
                };

                executor.start({
                    scmUrl: 'git@github.com:screwdriver-cd/hashr.git#addSD',
                    buildId: testBuildId,
                    jobId: testJobId,
                    pipelineId: testPipelineId,
                    container: 'container'
                }, (err) => {
                    assert.isNull(err);
                    assert.calledOnce(breakRunMock);
                    assert.calledWith(breakRunMock, postConfig);
                    done();
                });
            });

            it('with scmUrl without branch', (done) => {
                const postConfig = {
                    uri: jobsUrl,
                    method: 'POST',
                    json: {
                        metadata: {
                            name: testBuildId,
                            job: testJobId,
                            pipeline: testPipelineId
                        },
                        command: ['/opt/screwdriver/launch screwdriver-cd hashr master main']
                    },
                    headers: {
                        Authorization: 'Bearer api_key'
                    },
                    strictSSL: false
                };

                executor.start({
                    scmUrl: testScmUrl,
                    buildId: testBuildId,
                    jobId: testJobId,
                    pipelineId: testPipelineId,
                    container: 'container'
                }, (err) => {
                    assert.isNull(err);
                    assert.calledOnce(breakRunMock);
                    assert.calledWith(breakRunMock, postConfig);
                    done();
                });
            });
        });

        it('returns error when request responds with error', (done) => {
            const error = new Error('lol');

            breakRunMock.yieldsAsync(error);

            executor.start({
                scmUrl: testScmUrl,
                buildId: testBuildId,
                jobId: testJobId,
                pipelineId: testPipelineId,
                container: 'container'
            }, (err) => {
                assert.deepEqual(err, error);
                done();
            });
        });

        it('returns body when request responds with error in response', (done) => {
            const returnResponse = {
                statusCode: 500,
                body: {
                    statusCode: 500,
                    message: 'lol'
                }
            };
            const returnMessage = `Failed to create job: ${JSON.stringify(returnResponse.body)}`;

            breakRunMock.yieldsAsync(null, returnResponse);

            executor.start({
                scmUrl: testScmUrl,
                buildId: testBuildId,
                jobId: testJobId,
                pipelineId: testPipelineId,
                container: 'container'
            }, (err, response) => {
                assert.notOk(response);
                assert.equal(err.message, returnMessage);
                done();
            });
        });
    });

    describe('stream', () => {
        const pod = `${podsUrl}?labelSelector=sdbuild=${testBuildId}`;
        const logUrl = `${podsUrl}/mypod/log?container=build&follow=true&pretty=true`;

        it('reply with error when it fails to get pod', (done) => {
            const error = new Error('lol');

            breakRunMock.yieldsAsync(error);
            executor.stream({
                buildId: testBuildId
            }, (err) => {
                assert.isOk(err);
                done();
            });
        });

        it('reply with error when podname is not found', (done) => {
            const returnResponse = {
                statusCode: 200,
                body: {
                    items: []
                }
            };

            breakRunMock.yieldsAsync(null, returnResponse);
            executor.stream({
                buildId: testBuildId
            }, (err) => {
                assert.isOk(err);
                done();
            });
        });

        it('stream logs when podname is found', (done) => {
            const getConfig = {
                url: pod,
                json: true,
                headers: {
                    Authorization: 'Bearer api_key'
                },
                strictSSL: false
            };
            const logConfig = {
                url: logUrl,
                headers: {
                    Authorization: 'Bearer api_key'
                },
                strictSSL: false
            };
            const returnResponse = {
                statusCode: 200,
                body: {
                    items: [{
                        metadata: {
                            name: 'mypod'
                        }
                    }]
                }
            };
            const logGetMock = {
                mock: 'thing'
            };
            const readWrapMock = {
                mock: 'thing2'
            };

            breakRunMock.withArgs(getConfig)
                .yieldsAsync(null, returnResponse);
            requestMock.get.withArgs(logConfig).returns(logGetMock);
            readableMock.wrap.returns(readWrapMock);

            executor.stream({
                buildId: testBuildId
            }, (err, stream) => {
                assert.isNull(err);
                assert.calledOnce(breakRunMock);
                assert.calledOnce(requestMock.get);
                assert.calledWith(breakRunMock, getConfig);
                assert.calledWith(requestMock.get, logConfig);
                assert.calledWith(readableMock.wrap, logGetMock);
                assert.deepEqual(stream, readWrapMock);
                done();
            });
        });
    });
});
