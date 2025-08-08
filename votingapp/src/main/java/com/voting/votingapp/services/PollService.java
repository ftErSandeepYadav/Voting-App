package com.voting.votingapp.services;

import com.voting.votingapp.model.OptionVote;
import com.voting.votingapp.model.Poll;
import com.voting.votingapp.repositories.PollRepository;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.Optional;
import java.util.Scanner;

@Service
public class PollService {
    private PollRepository pollRepository ;

    public PollService(PollRepository pollRepository) {
        this.pollRepository = pollRepository;
    }

    public Poll createPoll(Poll poll) {
        return pollRepository.save(poll) ;
    }

    public List<Poll> getAllPolls() {
        return pollRepository.findAll() ;
    }

    public ResponseEntity<Poll> getPollById(Long id) {
        Optional<Poll> poll = pollRepository.findById(id) ;
        if(poll.isPresent()){
            return new ResponseEntity<>(poll.get(), HttpStatus.OK) ;
        }
        return new ResponseEntity<>(HttpStatus.NOT_FOUND) ;
    }

//    @Transactional
    public void vote(Long pollId, int optionIndex){
        Optional<Poll> poll = pollRepository.findById(pollId) ;

        if(!poll.isPresent()) return ;

        List<OptionVote> options = poll.get().getOptions();

        if(optionIndex<0 || optionIndex>=options.size()) return;

        options.get(optionIndex).setVoteCount(options.get(optionIndex).getVoteCount()+1);

        poll.get().setOptions(options);
        pollRepository.save(poll.get()) ;
    }

}
