// (C) Copyright 2015 Martin Dougiamas
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//     http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

angular.module('mm.addons.mod_quiz')

/**
 * Quiz attempt review controller.
 *
 * @module mm.addons.mod_quiz
 * @ngdoc controller
 * @name mmaModQuizReviewCtrl
 */
.controller('mmaModQuizReviewCtrl', function($log, $scope, $stateParams, $mmaModQuiz, $mmaModQuizHelper, $mmUtil,
            $ionicPopover, $ionicScrollDelegate, $translate, $q, $mmSite, $mmUser, mmaModQuizAttemptComponent) {
    $log = $log.getInstance('mmaModQuizReviewCtrl');

    var quizId = $stateParams.quizid,
        courseId = $stateParams.courseid,
        attemptId = $stateParams.attemptid,
        currentPage = $stateParams.page,
        quiz,
        options,
        attempt,
        scrollView = $ionicScrollDelegate.$getByHandle('mmaModQuizReviewScroll'),
        extraDataFetched = false;

    $scope.isReview = true;
    $scope.component = mmaModQuizAttemptComponent;
    $scope.componentId = attemptId;

    // Convenience function to get the quiz data.
    function fetchData() {
        return $mmaModQuiz.getQuizById(courseId, quizId).then(function(quizData) {
            quiz = quizData;

            // Load questions.
            return loadPage(currentPage);
        }).catch(function(message) {
            return $mmaModQuizHelper.showError(message);
        });
    }

    // Load a review page.
    function loadPage(page) {
        return $mmaModQuiz.getAttemptReview(attemptId, page).then(function(reviewData) {
            var promise;

            currentPage = page;
            attempt = reviewData.attempt;

            promise = extraDataFetched ? $q.when() : fetchExtraData();
            return promise.then(function() {
                extraDataFetched = true;

                // Set the summary data.
                setSummaryCalculatedData(reviewData);

                $scope.attempt = attempt;
                $scope.questions = reviewData.questions;
                $scope.toc = $mmaModQuiz.getTocFromLayout(attempt.layout);
                $scope.nextPage = page == -1 ? undefined : page + 1;
                $scope.previousPage = page - 1;
                attempt.currentpage = page;

                angular.forEach($scope.questions, function(question) {
                    // Get the readable mark for each question.
                    question.readableMark = $mmaModQuizHelper.getQuestionMarkFromHtml(question.html);
                    // Remove the question info box so it's not in the question HTML anymore.
                    question.html = $mmUtil.removeElementFromHtml(question.html, '.info');
                });
            });
        });
    }

    // Convenience function to fetch review options and user data.
    function fetchExtraData() {
        if (!quiz || !attempt) {
            return $q.reject();
        }

        var siteId = $mmSite.getId(),
            userId = attempt.userid;

        // Get combined review options.
        return $mmaModQuiz.getCombinedReviewOptions(quiz.id, siteId, userId).then(function(result) {
            options = result;

            var promises = [];

            if (userId != $mmSite.getUserId()) {
                // Reviewing another user's attempt.

                // Fetch user data.
                promises.push($mmUser.getProfile(userId, courseId, true).then(function(user) {
                    $scope.user = user;
                }));

                // Fetch user attempts.
                promises.push($mmaModQuiz.getUserAttempts(quizId, undefined, true, false, siteId, userId).then(function(attempts) {
                    $scope.attempts = attempts;
                }));

                return $q.all(promises);
            }
        });
    }

    // Calculate review summary data.
    function setSummaryCalculatedData(reviewData) {
        var timeTaken,
            grade = reviewData.rescaledgrade,
            gradeObject;

        attempt.readableState = $mmaModQuiz.getAttemptReadableStateName(attempt.state);
        if (attempt.state == $mmaModQuiz.ATTEMPT_FINISHED) {
            $scope.showCompleted = true;
            $scope.additionalData = reviewData.additionaldata;

            timeTaken = attempt.timefinish - attempt.timestart;
            if (timeTaken) {
                // Format timeTaken.
                $mmUtil.formatTime(timeTaken).then(function(takenTime) {
                    attempt.timeTaken = takenTime;
                });
                // Calculate overdue time.
                if (quiz.timelimit && timeTaken > quiz.timelimit + 60) {
                    $mmUtil.formatTime(timeTaken - quiz.timelimit).then(function(overTime) {
                        attempt.overTime = overTime;
                    });
                }
            }

            // Treat grade.
            if (options.someoptions.marks >= $mmaModQuiz.QUESTION_OPTIONS_MARK_AND_MAX && $mmaModQuiz.quizHasGrades(quiz)) {
                if (grade === null || typeof grade == 'undefined') {
                    attempt.readableGrade = $mmaModQuiz.formatGrade(grade, quiz.decimalpoints);
                } else {
                    // Show raw marks only if they are different from the grade (like on the entry page).
                    if (quiz.grade != quiz.sumgrades) {
                        attempt.readableMark = $translate.instant('mma.mod_quiz.outofshort', {$a: {
                            grade: $mmaModQuiz.formatGrade(attempt.sumgrades, quiz.decimalpoints),
                            maxgrade: $mmaModQuiz.formatGrade(quiz.sumgrades, quiz.decimalpoints)
                        }});
                    }

                    // Now the scaled grade.
                    gradeObject = {
                        grade: $mmaModQuiz.formatGrade(grade, quiz.decimalpoints),
                        maxgrade: $mmaModQuiz.formatGrade(quiz.grade, quiz.decimalpoints)
                    };
                    if (quiz.grade != 100) {
                        gradeObject.percent = $mmUtil.roundToDecimals(attempt.sumgrades * 100 / quiz.sumgrades, 0);
                        attempt.readableGrade = $translate.instant('mma.mod_quiz.outofpercent', {$a: gradeObject});
                    } else {
                        attempt.readableGrade = $translate.instant('mma.mod_quiz.outof', {$a: gradeObject});
                    }
                }
            }
        }
    }

    // Refreshes data.
    function refreshData() {
        var promises = [],
            siteId = $mmSite.getId();

        promises.push($mmaModQuiz.invalidateQuizData(courseId));
        promises.push($mmaModQuiz.invalidateAttemptReview(attemptId));
        if (attempt) {
            promises.push($mmaModQuiz.invalidateCombinedReviewOptionsForUser(quizId, siteId, attempt.userid));
            if (attempt.userid != $mmSite.getUserId()) {
                promises.push($mmaModQuiz.invalidateUserAttemptsForUser(quizId, siteId, attempt.userid));
            }
        }

        return $q.all(promises).finally(function() {
            extraDataFetched = false;
            return fetchData();
        });
    }

    // Fetch data.
    fetchData().then(function() {
        $mmaModQuiz.logViewAttemptSummary(attemptId);
    }).finally(function() {
        $scope.dataLoaded = true;
    });

    // Load a certain page.
    $scope.loadPage = function(page) {
        if (page == currentPage) {
            // If the user is navigating to the current page we do nothing.
            return;
        }

        $scope.dataLoaded = false;
        scrollView.scrollTop();
        $scope.popover.hide(); // Hide popover if shown.

        return loadPage(page).catch(function(message) {
            return $mmaModQuizHelper.showError(message);
        }).finally(function() {
            $scope.dataLoaded = true;
            scrollView.resize(); // Call resize to recalculate scroll area.
        });
    };

    // Pull to refresh.
    $scope.refreshData = function() {
        refreshData().finally(function() {
            $scope.$broadcast('scroll.refreshComplete');
        });
    };

    // Function to call when an error parsing the questions occur.
    $scope.abortQuiz = function() {
        // Do nothing, we'll show the review even if there's some error in a question.
        // The question should've already shown an error because of this.
    };

    // Load another attempt in the same quiz.
    $scope.loadAttempt = function(id) {
        attemptId = id;
        currentPage = undefined;
        extraDataFetched = false;

        $scope.loadPage(-1);
    };

    // Setup TOC popover.
    $ionicPopover.fromTemplateUrl('addons/mod_quiz/templates/toc.html', {
        scope: $scope,
    }).then(function(popover) {
        $scope.popover = popover;
    });
});
