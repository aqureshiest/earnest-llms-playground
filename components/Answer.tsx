import { useEffect, useState } from "react";
import styles from "./answer.module.css";

interface AnswerProps {
    text: string;
}

export const Answer: React.FC<AnswerProps> = ({ text }) => {
    const [words, setWords] = useState<string[]>([]);

    useEffect(() => {
        if (text) {
            setWords(text.split(" "));
        }
    }, [text]);

    return (
        <div
            className={`prose w-full text-2xl dark:text-gray-100 ${styles.fadeIn}`}
            dangerouslySetInnerHTML={{ __html: text }}
        />
    );
};
